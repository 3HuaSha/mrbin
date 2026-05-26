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

const DEFAULT_BRICK_YARD_ADDRESS = "12441 Woodbine Ave, Gormley, ON L4A 2K4";
const ROUTE_START_HOUR = 8;
const STOP_MINUTES = 15;

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
  score: number;
  etas: Array<{ orderId: string; label: string; eta: string; lateMinutes: number }>;
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
      .map((order) => ({
        id: order.id,
        label: orderLabel(order),
        pallets: order.pallet_count || 0,
        priority: order.priority || "P3",
        canSplit: order.can_split !== false,
      })),
    timeLimitSeconds: 5,
  }), [flatDrivers, driverLoads, unassigned]);

  const wholeRoute = useMutation({
    mutationFn: async (): Promise<WholeRouteResponse> => {
      const optimized = await optimizeBrickSchedule({ data: optimizerInput });
      if (!optimized.success) return { success: false as const, error: optimized.error || "OR-Tools 优化失败" };

      const matrixAddresses = [
        DEFAULT_BRICK_YARD_ADDRESS,
        ...optimizerInput.orders
          .map((inputOrder) => unassigned.find((order) => order.id === inputOrder.id)?.address)
          .filter(Boolean) as string[],
      ];
      const matrix = await getCachedRouteMatrix({ data: { addresses: matrixAddresses } });
      const matrixMap = makeMatrixMap(matrix.entries);

      const routes: WholeRouteResult[] = [];
      for (const load of optimized.loads || []) {
        const assigned = (optimized.assignments || [])
          .filter((assignment) => assignment.driverId === load.driverId)
          .map((assignment) => unassigned.find((order) => order.id === assignment.orderId))
          .filter(Boolean) as Order[];

        if (assigned.length === 0) {
          routes.push({
            driverId: load.driverId,
            driverName: load.driverName,
            vehicleName: load.vehicleName,
            load: load.finalLoad,
            capacity: load.capacity,
            orderIds: [],
            orderLabels: [],
            totalMinutes: 0,
            totalDistanceKm: 0,
            lateMinutes: 0,
            score: 0,
            etas: [],
          });
          continue;
        }

        const best = pickBestRoute(load, assigned, matrixMap);
        routes.push(best);
      }

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
                      <span>{route.load}/{route.capacity} PLT</span>
                    </div>
                    {route.orderLabels.length > 0 ? (
                      <>
                        <div className="mb-1 text-xs text-muted-foreground">
                          {route.orderLabels.join(" -> ")}
                        </div>
                        <div className="mb-1 text-xs">
                          总行程约 {route.totalMinutes} 分钟 · {route.totalDistanceKm.toFixed(1)} km
                          {route.lateMinutes > 0 && <span className="text-destructive"> · 晚到 {route.lateMinutes} 分钟</span>}
                        </div>
                        <div className="space-y-0.5">
                          {route.etas.map((eta) => (
                            <div key={eta.orderId} className="flex justify-between gap-2 text-xs">
                              <span className="truncate">{eta.label}</span>
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
              先由 OR-Tools 分配订单到 FLAT 车，再用路线矩阵缓存计算候选送货顺序。只有缺失路段会调用 Google Route Matrix。
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

function pickBestRoute(
  load: {
    driverId: string;
    driverName: string;
    vehicleName: string;
    finalLoad: number;
    capacity: number;
  },
  orders: Order[],
  matrix: Map<string, RouteMatrixEntry>,
): WholeRouteResult {
  const candidates = buildRouteCandidates(orders);
  const scored: WholeRouteResult[] = [];

  for (const candidate of candidates) {
    const scoredRoute = scoreRoute(load, candidate, matrix);
    scored.push(scoredRoute);
  }

  return scored.sort((a, b) => a.score - b.score)[0];
}

function buildRouteCandidates(orders: Order[]) {
  const candidates: Order[][] = [];
  const seen = new Set<string>();
  const add = (route: Order[]) => {
    const key = route.map((order) => order.id).join("|");
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(route);
    }
  };

  add([...orders].sort(compareByPriorityAndWindow));
  add([...orders].sort((a, b) => (b.pallet_count || 0) - (a.pallet_count || 0)));
  add([...orders].sort((a, b) => a.address.localeCompare(b.address)));

  if (orders.length <= 6) {
    add(nearestNeighborRoute(orders));
  }

  if (orders.length <= 5) {
    permutations(orders).slice(0, 12).forEach(add);
  }

  return candidates;
}

function compareByPriorityAndWindow(a: Order, b: Order) {
  const pa = priorityRank[a.priority || "P3"] || 3;
  const pb = priorityRank[b.priority || "P3"] || 3;
  if (pa !== pb) return pa - pb;
  return parseTimeWindow(a).endMinutes - parseTimeWindow(b).endMinutes;
}

function nearestNeighborRoute(orders: Order[]) {
  const remaining = [...orders].sort(compareByPriorityAndWindow);
  const route: Order[] = [];
  let current = DEFAULT_BRICK_YARD_ADDRESS;

  while (remaining.length > 0) {
    const next = remaining
      .map((order) => ({ order, distance: roughDistance(current, order.address) }))
      .sort((a, b) => a.distance - b.distance || compareByPriorityAndWindow(a.order, b.order))[0].order;
    route.push(next);
    current = next.address;
    remaining.splice(remaining.findIndex((order) => order.id === next.id), 1);
  }

  return route;
}

function permutations<T>(items: T[]) {
  if (items.length <= 1) return [items];
  const result: T[][] = [];
  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    permutations(rest).forEach((perm) => result.push([item, ...perm]));
  });
  return result;
}

function scoreRoute(
  load: {
    driverId: string;
    driverName: string;
    vehicleName: string;
    finalLoad: number;
    capacity: number;
  },
  route: Order[],
  matrix: Map<string, RouteMatrixEntry>,
): WholeRouteResult {
  let elapsedMinutes = 0;
  let lateMinutes = 0;
  const etas: WholeRouteResult["etas"] = [];
  let totalDistanceMeters = 0;

  route.forEach((order, index) => {
    const from = index === 0 ? DEFAULT_BRICK_YARD_ADDRESS : route[index - 1].address;
    const leg = getMatrixLeg(matrix, from, order.address);
    const driveMinutes = Math.round(leg.duration / 60);
    totalDistanceMeters += leg.distance;
    elapsedMinutes += driveMinutes;

    const arrivalMinutes = ROUTE_START_HOUR * 60 + elapsedMinutes;
    const window = parseTimeWindow(order);
    const late = Math.max(0, arrivalMinutes - window.endMinutes);
    const priorityPenalty = priorityRank[order.priority || "P3"] || 3;
    lateMinutes += late * (5 - Math.min(priorityPenalty, 4));

    etas.push({
      orderId: order.id,
      label: orderLabel(order),
      eta: formatClock(arrivalMinutes),
      lateMinutes: late,
    });

    elapsedMinutes += STOP_MINUTES;
  });

  const lastAddress = route[route.length - 1]?.address || DEFAULT_BRICK_YARD_ADDRESS;
  const returnLeg = getMatrixLeg(matrix, lastAddress, DEFAULT_BRICK_YARD_ADDRESS);
  elapsedMinutes += Math.round(returnLeg.duration / 60);
  totalDistanceMeters += returnLeg.distance;

  const totalDistanceKm = totalDistanceMeters / 1000;
  const score = elapsedMinutes + totalDistanceKm * 0.5 + lateMinutes * 20;

  return {
    driverId: load.driverId,
    driverName: load.driverName,
    vehicleName: load.vehicleName,
    load: load.finalLoad,
    capacity: load.capacity,
    orderIds: route.map((order) => order.id),
    orderLabels: route.map(orderLabel),
    totalMinutes: elapsedMinutes,
    totalDistanceKm,
    lateMinutes,
    score,
    etas,
  };
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
