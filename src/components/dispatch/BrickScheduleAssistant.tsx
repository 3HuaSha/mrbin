import React, { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, PackageCheck, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Assignment, Order, Profile, Vehicle } from "@/types/dispatch";
import { optimizeBrickSchedule } from "@/actions/brick-optimizer";

interface BrickScheduleAssistantProps {
  drivers: Profile[];
  assignments: Assignment[];
  unassigned: Order[];
  getVehicle: (driverId: string) => Vehicle | undefined;
}

type PlannedOrder = {
  order: Order;
  loadAfter: number;
};

const priorityRank: Record<string, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

function isFlatVehicle(vehicle: Vehicle | undefined) {
  return (vehicle?.name || "").toUpperCase().startsWith("FLAT");
}

function capacityOf(vehicle: Vehicle | undefined) {
  return vehicle?.max_pallets || 28;
}

function orderLabel(order: Order) {
  return order.order_number || order.netsuite_order_id || order.customer_name || order.id.slice(0, 8);
}

export function BrickScheduleAssistant({
  drivers,
  assignments,
  unassigned,
  getVehicle,
}: BrickScheduleAssistantProps) {
  const flatDrivers = useMemo(
    () => drivers
      .map((driver) => ({ driver, vehicle: getVehicle(driver.id) }))
      .filter(({ vehicle }) => isFlatVehicle(vehicle)),
    [drivers, getVehicle],
  );

  const driverLoads = useMemo(() => {
    const map = new Map<string, number>();
    assignments.forEach((assignment) => {
      map.set(
        assignment.driver_id,
        (map.get(assignment.driver_id) || 0) + (assignment.orders.pallet_count || 0),
      );
    });
    return map;
  }, [assignments]);

  const assignedWithoutPallets = useMemo(
    () => assignments.filter((assignment) => !assignment.orders.pallet_count),
    [assignments],
  );

  const nonFlatAssigned = useMemo(
    () => drivers
      .map((driver) => ({ driver, vehicle: getVehicle(driver.id) }))
      .filter(({ vehicle }) => vehicle && !isFlatVehicle(vehicle))
      .filter(({ driver }) => assignments.some((assignment) => assignment.driver_id === driver.id)),
    [drivers, assignments, getVehicle],
  );

  const planning = useMemo(() => {
    const loads = new Map<string, number>();
    flatDrivers.forEach(({ driver }) => loads.set(driver.id, driverLoads.get(driver.id) || 0));

    const planned = new Map<string, PlannedOrder[]>();
    flatDrivers.forEach(({ driver }) => planned.set(driver.id, []));

    const missingPallets: Order[] = [];
    const unplanned: Array<{ order: Order; reason: string }> = [];

    const candidates = [...unassigned].sort((a, b) => {
      const pa = priorityRank[a.priority || "P3"] || 3;
      const pb = priorityRank[b.priority || "P3"] || 3;
      if (pa !== pb) return pa - pb;
      return (b.pallet_count || 0) - (a.pallet_count || 0);
    });

    candidates.forEach((order) => {
      const pallets = order.pallet_count || 0;
      if (!pallets) {
        missingPallets.push(order);
        return;
      }

      const best = flatDrivers
        .map(({ driver, vehicle }) => {
          const current = loads.get(driver.id) || 0;
          return {
            driver,
            vehicle,
            current,
            remaining: capacityOf(vehicle) - current,
          };
        })
        .filter((candidate) => candidate.remaining >= pallets)
        .sort((a, b) => a.remaining - b.remaining)[0];

      if (!best) {
        unplanned.push({
          order,
          reason: pallets > 28 && order.can_split === false
            ? "超过 28 PLT 且不可拆单"
            : "当前 FLAT 车辆剩余容量不足",
        });
        return;
      }

      const nextLoad = best.current + pallets;
      loads.set(best.driver.id, nextLoad);
      planned.get(best.driver.id)?.push({ order, loadAfter: nextLoad });
    });

    return { planned, missingPallets, unplanned };
  }, [flatDrivers, driverLoads, unassigned]);

  const overloaded = flatDrivers.filter(({ driver, vehicle }) => {
    const load = driverLoads.get(driver.id) || 0;
    return load > capacityOf(vehicle);
  });

  const issueCount =
    overloaded.length +
    assignedWithoutPallets.length +
    nonFlatAssigned.length +
    planning.missingPallets.length +
    planning.unplanned.length;

  const optimizerInput = useMemo(() => ({
    vehicles: flatDrivers.map(({ driver, vehicle }) => ({
      driverId: driver.id,
      driverName: driver.name,
      vehicleName: vehicle?.name || "",
      capacity: capacityOf(vehicle),
      currentLoad: driverLoads.get(driver.id) || 0,
    })),
    orders: unassigned
      .filter((order) => (order.pallet_count || 0) > 0)
      .map((order) => ({
        id: order.id,
        label: orderLabel(order),
        pallets: order.pallet_count || 0,
        priority: order.priority || "P3",
        canSplit: order.can_split !== false,
      })),
    timeLimitSeconds: 5,
  }), [flatDrivers, driverLoads, unassigned]);

  const optimize = useMutation({
    mutationFn: async () => optimizeBrickSchedule({ data: optimizerInput }),
  });

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Wand2 className="h-4 w-4" />
          辅助排班
          {issueCount > 0 && (
            <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
              {issueCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[520px] overflow-y-auto sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle>送砖辅助排班</SheetTitle>
          <SheetDescription>
            只使用车名以 FLAT 开头的车辆，默认容量按 28 PLT 或车辆 max_pallets 计算。
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">当前装载检查</h3>
              <Badge variant={overloaded.length ? "destructive" : "secondary"}>
                {flatDrivers.length} 台 FLAT
              </Badge>
            </div>

            <div className="space-y-2">
              {flatDrivers.length === 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  没有找到 FLAT 开头的拉砖车辆。
                </div>
              )}

              {flatDrivers.map(({ driver, vehicle }) => {
                const load = driverLoads.get(driver.id) || 0;
                const capacity = capacityOf(vehicle);
                const percent = Math.min(100, Math.round((load / capacity) * 100));
                const over = load > capacity;

                return (
                  <div key={driver.id} className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{driver.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{vehicle?.name || "未绑定车辆"}</div>
                      </div>
                      <Badge variant={over ? "destructive" : "outline"}>
                        {load}/{capacity} PLT
                      </Badge>
                    </div>
                    <Progress value={percent} className={cn(over && "bg-destructive/20")} />
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">未排订单建议</h3>
            </div>

            <Button
              className="mb-3 w-full gap-2"
              onClick={() => optimize.mutate()}
              disabled={optimize.isPending || optimizerInput.vehicles.length === 0 || optimizerInput.orders.length === 0}
            >
              <Wand2 className="h-4 w-4" />
              {optimize.isPending ? "OR-Tools 计算中..." : "用 OR-Tools 优化装车"}
            </Button>

            {optimize.data && (
              <div className="mb-3 space-y-2 rounded-md border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">OR-Tools 结果</div>
                  {optimize.data.status && <Badge variant="secondary">{optimize.data.status}</Badge>}
                </div>
                {!optimize.data.success && (
                  <div className="text-sm text-destructive">{optimize.data.error || "优化失败"}</div>
                )}
                {optimize.data.success && optimize.data.loads?.map((load) => (
                  <div key={load.driverId} className="rounded border bg-background p-2">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold">
                      <span className="truncate">{load.driverName} · {load.vehicleName}</span>
                      <span>{load.finalLoad}/{load.capacity} PLT</span>
                    </div>
                    <div className="space-y-1">
                      {optimize.data.assignments
                        ?.filter((assignment) => assignment.driverId === load.driverId)
                        .map((assignment) => (
                          <div key={`${assignment.orderId}-${assignment.pallets}`} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate">
                              {assignment.orderLabel} · {assignment.priority}
                              {assignment.split ? " · 拆单" : ""}
                            </span>
                            <span className="shrink-0">{assignment.pallets} PLT</span>
                          </div>
                        ))}
                      {optimize.data.assignments?.filter((assignment) => assignment.driverId === load.driverId).length === 0 && (
                        <div className="text-xs text-muted-foreground">没有新增建议</div>
                      )}
                    </div>
                  </div>
                ))}
                {optimize.data.success && (optimize.data.unplanned?.length || 0) > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-destructive">未安排</div>
                    {optimize.data.unplanned?.map((order) => (
                      <div key={order.id} className="text-xs text-destructive">
                        {order.label} · {order.pallets} PLT · {order.reason || "未安排"}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              {flatDrivers.map(({ driver, vehicle }) => {
                const items = planning.planned.get(driver.id) || [];
                if (items.length === 0) return null;
                return (
                  <div key={driver.id} className="rounded-md border p-3">
                    <div className="mb-2 text-sm font-semibold">
                      {driver.name} · {vehicle?.name}
                    </div>
                    <div className="space-y-1">
                      {items.map(({ order, loadAfter }) => (
                        <div key={order.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate">
                            {orderLabel(order)} · {order.pallet_count} PLT · {order.priority || "P3"}
                          </span>
                          <span className="shrink-0 text-muted-foreground">到 {loadAfter} PLT</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {[...planning.planned.values()].every((items) => items.length === 0) && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  当前没有可直接放入剩余容量的未排订单。
                </div>
              )}
            </div>
          </section>

          {issueCount > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h3 className="text-sm font-semibold">需要处理</h3>
              </div>
              <div className="space-y-2 text-sm">
                {overloaded.map(({ driver, vehicle }) => (
                  <IssueLine
                    key={`over-${driver.id}`}
                    text={`${driver.name} 超载：${driverLoads.get(driver.id) || 0}/${capacityOf(vehicle)} PLT`}
                  />
                ))}
                {nonFlatAssigned.map(({ driver, vehicle }) => (
                  <IssueLine
                    key={`nonflat-${driver.id}`}
                    text={`${driver.name} 当前车辆不是 FLAT：${vehicle?.name}`}
                  />
                ))}
                {assignedWithoutPallets.map((assignment) => (
                  <IssueLine
                    key={`assigned-missing-${assignment.id}`}
                    text={`已排订单 ${orderLabel(assignment.orders)} 未填写板数`}
                  />
                ))}
                {planning.missingPallets.map((order) => (
                  <IssueLine key={`missing-${order.id}`} text={`未排订单 ${orderLabel(order)} 未填写板数`} />
                ))}
                {planning.unplanned.map(({ order, reason }) => (
                  <IssueLine key={`unplanned-${order.id}`} text={`${orderLabel(order)}：${reason}`} />
                ))}
              </div>
            </section>
          )}

          {issueCount === 0 && (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              当前没有发现容量和基础数据问题。
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function IssueLine({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive">
      {text}
    </div>
  );
}
