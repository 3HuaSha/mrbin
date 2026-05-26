import React, { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Wand2 } from "lucide-react";
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
import { getCachedRouteMatrix, RouteMatrixEntry } from "@/actions/route-matrix";
import { getFullAddress } from "@/lib/manual-step-locations";
import { supabase } from "@/integrations/supabase/client";

const DEPOT_ADDRESS = "12441 Woodbine Ave, Gormley, ON L4A 2K4";

// Yard code → full address mapping (for pickupAddress on delivery orders)
const YARD_ADDRESSES: Record<string, string> = {
  "3445": "3445 Kennedy Rd, Scarborough, ON M1V 4Y3",
  "12441": "12441 Woodbine Ave, Gormley, ON L4A 2K4",
  "2967": "2967 Kennedy Rd, Scarborough, ON M1V 1S9",
  "150": "150 Clark Blvd, Brampton, ON L6T 4Y8",
};

const YARD_LABELS: Record<string, string> = {
  "3445": "3445场地",
  "12441": "12441场地",
  "2967": "2967场地",
  "150": "150场地",
};

interface BrickScheduleAssistantProps {
  drivers: Profile[];
  assignments: Assignment[];
  unassigned: Order[];
  getVehicle: (driverId: string) => Vehicle | undefined;
}

type WholeRouteResult = {
  driverId: string;
  driverName: string;
  vehicleName: string;
  load: number;
  capacity: number;
  orderIds: string[];
  orderLabels: string[];
  totalMinutes: number;
  totalDistanceKm: number;
  lateMinutes: number;
  pickupPallets: number;
  etas: Array<{ orderId: string; label: string; eta: string; lateMinutes: number; type: "yard_pickup" | "delivery" | "pickup" | "pickup_delivery" }>;
};

type WholeRouteResponse = {
  success: boolean;
  error?: string;
  status?: string;
  routes?: WholeRouteResult[];
  unplanned?: Array<{ id: string; label: string; pallets: number; reason?: string }>;
  cacheHits?: number;
  googleElements?: number;
  fallbackElements?: number;
  totalPairs?: number;
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

  const missingPalletOrders = useMemo(
    () => unassigned.filter((order) => !order.pallet_count),
    [unassigned],
  );

  const overloaded = flatDrivers.filter(({ driver, vehicle }) => {
    const load = driverLoads.get(driver.id) || 0;
    return load > capacityOf(vehicle);
  });

  const issueCount =
    overloaded.length +
    assignedWithoutPallets.length +
    nonFlatAssigned.length +
    missingPalletOrders.length;

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
      .map((order) => {
        const window = parseTimeWindow(order);
        const yardId = order.origin_yard_id || "12441";
        // Yard resolution happens in mutationFn at click-time
        const pickupAddress = YARD_ADDRESSES[yardId] || getFullAddress(yardId) || DEPOT_ADDRESS;
        const pickupLabel = YARD_LABELS[yardId] || yardId;
        return {
          id: order.id,
          label: orderLabel(order),
          pallets: order.pallet_count || 0,
          pickupAddress,
          deliveryAddress: order.address || "",
          pickupLabel,
          deliveryLabel: orderLabel(order),
          priority: order.priority || "P3",
          startMinutes: window.startMinutes,
          endMinutes: window.endMinutes,
          must: window.must,
        };
      }),
    timeLimitSeconds: 30,
  }), [flatDrivers, driverLoads, unassigned]);

  const wholeRoute = useMutation({
    mutationFn: async (): Promise<WholeRouteResponse> => {
      // Fetch company_yards at click-time to resolve UUID → name/address
      const { data: yards } = await supabase
        .from("company_yards")
        .select("id,name,address");
      const yardLookup = new Map<string, { name: string; address: string }>();
      (yards || []).forEach((y: { id: string; name: string; address: string }) => yardLookup.set(y.id, { name: y.name, address: y.address }));

      // Rebuild orders from unassigned + yardLookup (not from pre-computed optimizerInput)
      const ordersWithAddress = unassigned
        .filter((order) => (order.pallet_count || 0) > 0 && order.address)
        .map((order) => {
          const window = parseTimeWindow(order);
          const yardId = order.origin_yard_id || "12441";
          const yardInfo = yardLookup.get(yardId);
          const pickupAddress = yardInfo?.address || YARD_ADDRESSES[yardId] || getFullAddress(yardId) || DEPOT_ADDRESS;
          const pickupLabel = yardInfo?.name || YARD_LABELS[yardId] || yardId;
          return {
            id: order.id,
            label: orderLabel(order),
            pallets: order.pallet_count || 0,
            pickupAddress,
            deliveryAddress: order.address || "",
            pickupLabel,
            deliveryLabel: orderLabel(order),
            priority: order.priority || "P3",
            startMinutes: window.startMinutes,
            endMinutes: window.endMinutes,
            must: window.must,
          };
        });

      if (ordersWithAddress.length === 0) {
        return { success: false as const, error: "没有可排的订单地址" };
      }

      // Pickup orders: supplier → yard/customer (hardcoded for now, will come from UI)
      const pickupOrders: Array<{
        id: string; label: string; pallets: number;
        pickupAddress: string; deliveryAddress: string;
        pickupLabel?: string; deliveryLabel?: string;
        priority?: string; endMinutes?: number;
      }> = [];

      // Build address list for single-depot P&D matrix:
      // index 0 = depot, 1,2 = delivery order 0 (pickup at yard, delivery at customer), ...
      // 2*D+1, 2*D+2 = pickup order 0 (pickup at supplier, delivery at dest), ...
      const deliveryAddresses = ordersWithAddress.flatMap((o) => [o.pickupAddress, o.deliveryAddress]);
      const pickupAddresses = pickupOrders.flatMap((po) => [po.pickupAddress, po.deliveryAddress]);
      const addresses = [
        DEPOT_ADDRESS,
        ...deliveryAddresses,
        ...pickupAddresses,
      ];

      const matrix = await getCachedRouteMatrix({ data: { addresses } });
      const matrixMap = makeMatrixMap(matrix.entries);

      // Build 2D matrices: (1+2*D+2*P) x (1+2*D+2*P)
      const n = addresses.length;
      const durationMatrix: number[][] = [];
      const distanceMatrix: number[][] = [];

      for (let i = 0; i < n; i++) {
        durationMatrix[i] = [];
        distanceMatrix[i] = [];
        for (let j = 0; j < n; j++) {
          if (i === j) {
            durationMatrix[i][j] = 0;
            distanceMatrix[i][j] = 0;
          } else {
            const leg = getMatrixLeg(matrixMap, addresses[i], addresses[j]);
            durationMatrix[i][j] = Math.round(leg.duration / 60); // minutes
            distanceMatrix[i][j] = Math.round(leg.distance / 1000); // km
          }
        }
      }

      const vrpInput = {
        vehicles: optimizerInput.vehicles,
        deliveryOrders: ordersWithAddress,
        pickupOrders,
        durationMatrix,
        distanceMatrix,
        serviceMinutes: 15,
        routeStartHour: 8,
        timeLimitSeconds: 30,
      };

      const optimized = await optimizeBrickSchedule({ data: vrpInput });
      if (!optimized.success) return { success: false as const, error: optimized.error || "OR-Tools 优化失败" };

      // Convert VRP routes directly (already have ordered stops)
      const routes: WholeRouteResult[] = (optimized.routes || []).map((vrpRoute) => ({
        driverId: vrpRoute.driverId,
        driverName: vrpRoute.driverName,
        vehicleName: vrpRoute.vehicleName,
        load: vrpRoute.load,
        capacity: vrpRoute.capacity,
        orderIds: vrpRoute.stops.filter((s) => s.type === "delivery").map((s) => s.orderId),
        orderLabels: vrpRoute.stops.filter((s) => s.type === "delivery").map((s) => s.label),
        totalMinutes: vrpRoute.totalMinutes,
        totalDistanceKm: vrpRoute.totalDistanceKm,
        lateMinutes: vrpRoute.lateMinutes,
        pickupPallets: vrpRoute.pickupPallets || 0,
        etas: vrpRoute.stops.map((s) => ({
          orderId: s.orderId,
          label: s.label,
          eta: formatClock(s.etaMinutes),
          lateMinutes: s.lateMinutes,
          type: s.type,
        })),
      }));

      return {
        success: true as const,
        status: optimized.status,
        routes,
        unplanned: optimized.unplanned || [],
        cacheHits: matrix.cacheHits,
        googleElements: matrix.googleElements,
        fallbackElements: matrix.fallbackElements,
        totalPairs: matrix.entries.length,
      };
    },
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
            <h3 className="mb-2 text-sm font-semibold">整体自动排班</h3>

            <Button
              variant="secondary"
              className="mb-3 w-full gap-2"
              onClick={() => wholeRoute.mutate()}
              disabled={wholeRoute.isPending || optimizerInput.vehicles.length === 0 || optimizerInput.orders.length === 0}
            >
              <Wand2 className="h-4 w-4" />
              {wholeRoute.isPending ? "整体排班计算中..." : "整体自动排班"}
            </Button>

            {wholeRoute.data && (
              <div className="mb-3 space-y-2 rounded-md border bg-primary/5 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">整体自动排班结果</div>
                  {wholeRoute.data.success && wholeRoute.data.status && <Badge variant="secondary">{wholeRoute.data.status}</Badge>}
                </div>
                {wholeRoute.data.success && (
                  <div className="rounded bg-background px-2 py-1 text-xs text-muted-foreground">
                    路线矩阵：缓存 {wholeRoute.data.cacheHits || 0} 段 · Google 新算 {wholeRoute.data.googleElements || 0} 段
                    {(wholeRoute.data.fallbackElements || 0) > 0 && ` · 粗略估算 ${wholeRoute.data.fallbackElements} 段`}
                  </div>
                )}
                {!wholeRoute.data.success && (
                  <div className="text-sm text-destructive">{wholeRoute.data.error}</div>
                )}
                {wholeRoute.data.success && wholeRoute.data.routes?.map((route) => (
                  <div key={route.driverId} className="rounded border bg-background p-2">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold">
                      <span className="truncate">{route.driverName} · {route.vehicleName}</span>
                      <span>{route.load}/{route.capacity} PLT{route.pickupPallets > 0 ? ` (+${route.pickupPallets}取货)` : ""}</span>
                    </div>
                    {route.etas.length > 0 ? (
                      <>
                        <div className="mb-1 text-xs text-muted-foreground">
                          {route.etas.map((eta) => {
                            if (eta.type === "yard_pickup") return `�${eta.label}`;
                            if (eta.type === "pickup") return `�🏭${eta.label}`;
                            if (eta.type === "pickup_delivery") return `📦${eta.label}`;
                            return eta.label;
                          }).join(" → ")}
                        </div>
                        <div className="mb-1 text-xs">
                          总行程约 {route.totalMinutes} 分钟 · {route.totalDistanceKm.toFixed(1)} km
                          {route.lateMinutes > 0 && <span className="text-destructive"> · 晚到 {route.lateMinutes} 分钟</span>}
                        </div>
                        <div className="space-y-0.5">
                          {route.etas.map((eta) => (
                            <div key={`${eta.orderId}-${eta.type}`} className={cn("flex justify-between gap-2 text-xs", eta.type === "yard_pickup" && "bg-amber-500/10 rounded px-1", eta.type === "pickup" && "bg-primary/10 rounded px-1", eta.type === "pickup_delivery" && "bg-blue-500/10 rounded px-1")}>
                              <span className="truncate">{eta.type === "yard_pickup" ? "🏗" : eta.type === "pickup" ? "🏭" : eta.type === "pickup_delivery" ? "📦" : ""}{eta.label}</span>
                              <span className={eta.lateMinutes > 0 ? "text-destructive" : "text-muted-foreground"}>
                                {eta.eta}{eta.lateMinutes > 0 ? ` +${eta.lateMinutes}m` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground">没有新增路线</div>
                    )}
                  </div>
                ))}
                {wholeRoute.data.success && (wholeRoute.data.unplanned?.length || 0) > 0 && (
                  <div className="space-y-1 text-xs text-destructive">
                    <div className="font-semibold">未安排</div>
                    {wholeRoute.data.unplanned?.map((order) => (
                      <div key={order.id}>{order.label} · {order.pallets} PLT · {order.reason || "未安排"}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              OR-Tools VRP 求解器同时分配订单到车辆并优化送货路线，使用 Google 路线矩阵（缓存优先）计算实际距离和时间。
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
                {missingPalletOrders.map((order) => (
                  <IssueLine key={`missing-${order.id}`} text={`未排订单 ${orderLabel(order)} 未填写板数`} />
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


function parseTimeWindow(order: Order) {
  const raw = `${order.time_window === "custom" ? order.time_window_custom || "" : order.time_window} ${order.customer_notes || ""}`.toLowerCase();
  const priority = order.priority || "P3";
  let startMinutes = 8 * 60;
  let endMinutes = 17 * 60;

  if (raw.includes("asap")) {
    endMinutes = 10 * 60;
  } else if (raw.includes("before 12") || raw.includes("noon")) {
    endMinutes = 12 * 60;
  } else if (raw.includes("am")) {
    endMinutes = 12 * 60;
  } else if (raw.includes("pm")) {
    startMinutes = 12 * 60;
    endMinutes = 17 * 60;
  }

  const range = raw.match(/(\d{1,2})(?::\d{2})?\s*(am|pm)?\s*[-~]\s*(\d{1,2})(?::\d{2})?\s*(am|pm)?/);
  if (range) {
    const startSuffix = range[2] || range[4] || "";
    const endSuffix = range[4] || range[2] || "";
    startMinutes = parseHour(range[1], startSuffix);
    endMinutes = parseHour(range[3], endSuffix);
    if (endMinutes <= startMinutes && !range[4] && !range[2]) {
      endMinutes += 12 * 60;
    }
  }

  const must = raw.includes("must") || priority === "P1";
  return { startMinutes, endMinutes, must };
}

function parseHour(hourText: string, suffix: string) {
  let hour = Number(hourText);
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (!suffix && hour <= 6) hour += 12;
  return hour * 60;
}

function formatClock(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function makeMatrixMap(entries: RouteMatrixEntry[]) {
  const map = new Map<string, RouteMatrixEntry>();
  entries.forEach((entry) => {
    map.set(matrixKey(entry.from, entry.to), entry);
  });
  return map;
}

function getMatrixLeg(matrix: Map<string, RouteMatrixEntry>, from: string, to: string) {
  return matrix.get(matrixKey(from, to)) || {
    from,
    to,
    duration: Math.max(15, roughDistance(from, to) * 1.3) * 60,
    distance: roughDistance(from, to) * 1000,
    source: "fallback" as const,
  };
}

function matrixKey(from: string, to: string) {
  return `${from.trim().toLowerCase()}|||${to.trim().toLowerCase()}`;
}

function roughDistance(a: string, b: string) {
  const text = `${a} ${b}`.toLowerCase();
  const west = ["oakville", "milton", "brampton", "georgetown"];
  const east = ["pickering", "scarborough"];
  const north = ["vaughan", "thornhill", "markham"];
  const aw = west.some((item) => a.toLowerCase().includes(item));
  const bw = west.some((item) => b.toLowerCase().includes(item));
  const ae = east.some((item) => a.toLowerCase().includes(item));
  const be = east.some((item) => b.toLowerCase().includes(item));
  const an = north.some((item) => a.toLowerCase().includes(item));
  const bn = north.some((item) => b.toLowerCase().includes(item));
  if ((aw && bw) || (ae && be) || (an && bn)) return 18;
  if (text.includes("12441")) return 35;
  return 55;
}
