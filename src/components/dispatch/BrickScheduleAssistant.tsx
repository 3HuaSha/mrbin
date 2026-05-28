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
import { supabase } from "@/integrations/supabase/client";

const DEPOT_ADDRESS = "12441 Woodbine Ave, Gormley, ON L4A 2K4";
const ROUTE_START_MINUTES = 6 * 60;
const ROUTE_END_MINUTES = 23 * 60;

const KNOWN_LOCATIONS: Record<string, { label: string; address: string }> = {
  "12441": { label: "12441", address: "12441 Woodbine Ave, Gormley, ON L4A 2K4" },
  "3445": { label: "3445", address: "3445 Kennedy Rd, Scarborough, ON M1V 4Y3" },
  "2967": { label: "2967", address: "2967 Kennedy Rd, Scarborough, ON M1V 1S9" },
  "150": { label: "150", address: "150 Clark Blvd, Brampton, ON L6T 4Y8" },
  "189": { label: "189", address: "189 Select Ave, Scarborough, ON M1V 5J3" },
  GEORGETOWN: { label: "GEORGETOWN", address: "287 Armstrong Ave, Georgetown, ON L7G 4X6" },
  "UNILOCK (GEORGETOWN)": { label: "UNILOCK Georgetown", address: "287 Armstrong Ave, Georgetown, ON L7G 4X6" },
  "UNILOCK (PICKERING)": { label: "UNILOCK Pickering", address: "1019 Toy Ave, Pickering, ON L1W 3N9" },
  "TRIPLE H (PUTNAM)": { label: "TRIPLE H Putnam", address: "596728 Highway 59, Putnam, ON N0L 2B0" },
  "BW (WOODBRIDGE)": { label: "BW Woodbridge", address: "75 Haist Ave, Woodbridge, ON L4L 5V5" },
};

interface BrickScheduleAssistantProps {
  drivers: Profile[];
  assignments: Assignment[];
  unassigned: Order[];
  getVehicle: (driverId: string) => Vehicle | undefined;
}

type LoadOrder = {
  orderId: string;
  label: string;
  pallets: number;
  priority: string;
};

type RouteEta = {
  orderId: string;
  label: string;
  address?: string;
  eta: string;
  depart?: string;
  serviceMinutes?: number;
  loadAfter?: number;
  pallets: number;
  lateMinutes: number;
  type: "order_pickup" | "delivery" | "restock_pickup" | "restock_dropoff";
};

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
  restockPallets: number;
  loadOrders: LoadOrder[];
  etas: RouteEta[];
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

type LocationLookup = Map<string, { label: string; address: string }>;
type DeliveryOrderInput = ReturnType<typeof buildDeliveryOrder>;
type RestockOrderInput = NonNullable<ReturnType<typeof buildRestockOrder>>;

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

  const vehicleInput = useMemo(() => flatDrivers.map(({ driver, vehicle }) => ({
    driverId: driver.id,
    driverName: driver.name,
    vehicleName: vehicle?.name || "",
    capacity: capacityOf(vehicle),
    currentLoad: driverLoads.get(driver.id) || 0,
  })), [flatDrivers, driverLoads]);

  const schedulableCount = useMemo(
    () => unassigned.filter((order) => (order.pallet_count || 0) > 0 && order.address).length,
    [unassigned],
  );

  const wholeRoute = useMutation({
    mutationFn: async (): Promise<WholeRouteResponse> => {
      const lookup = await buildLocationLookup();

      const deliveryOrders = unassigned
        .filter((order) =>
          (order.pallet_count || 0) > 0 &&
          order.address &&
          (order.brick_order_type || "delivery_to_customer") === "delivery_to_customer"
        )
        .map((order) => buildDeliveryOrder(order, lookup));

      const restockOrders: RestockOrderInput[] = unassigned
        .filter((order) =>
          (order.pallet_count || 0) > 0 &&
          order.brick_order_type === "pickup_from_factory"
        )
        .map((order) => buildRestockOrder(order, lookup))
        .filter((order): order is RestockOrderInput => Boolean(order));

      if (deliveryOrders.length === 0 && restockOrders.length === 0) {
        return { success: false as const, error: "没有可排的送砖/补货订单" };
      }

      const addresses = [
        DEPOT_ADDRESS,
        ...deliveryOrders.flatMap((order) => [
          ...order.pickups.map((pickup) => pickup.address),
          order.deliveryAddress,
        ]),
        ...restockOrders.flatMap((order) => [order.pickupAddress, order.deliveryAddress]),
      ];

      const matrix = await getCachedRouteMatrix({ data: { addresses } });
      const matrixMap = makeMatrixMap(matrix.entries);

      const n = addresses.length;
      const durationMatrix: number[][] = [];
      const distanceMatrix: number[][] = [];
      const serviceMinutesByNode = buildServiceMinutes(deliveryOrders, restockOrders);

      for (let i = 0; i < n; i++) {
        durationMatrix[i] = [];
        distanceMatrix[i] = [];
        for (let j = 0; j < n; j++) {
          if (i === j) {
            durationMatrix[i][j] = 0;
            distanceMatrix[i][j] = 0;
          } else {
            const leg = getMatrixLeg(matrixMap, addresses[i], addresses[j]);
            durationMatrix[i][j] = Math.round(leg.duration / 60);
            distanceMatrix[i][j] = Math.round(leg.distance / 1000);
          }
        }
      }

      const optimized = await optimizeBrickSchedule({
        data: {
          vehicles: vehicleInput,
          deliveryOrders,
          restockOrders,
          durationMatrix,
          distanceMatrix,
          serviceMinutesByNode,
          routeStartMinutes: ROUTE_START_MINUTES,
          routeEndMinutes: ROUTE_END_MINUTES,
          timeLimitSeconds: 30,
        },
      });

      if (!optimized.success) {
        return { success: false as const, error: optimized.error || "OR-Tools 优化失败" };
      }

      const routes: WholeRouteResult[] = (optimized.routes || []).map((route) => ({
        driverId: route.driverId,
        driverName: route.driverName,
        vehicleName: route.vehicleName,
        load: route.load,
        capacity: route.capacity,
        orderIds: route.stops.filter((stop) => stop.type === "delivery").map((stop) => stop.orderId),
        orderLabels: route.stops.filter((stop) => stop.type === "delivery").map((stop) => stop.label),
        totalMinutes: route.totalMinutes,
        totalDistanceKm: route.totalDistanceKm,
        lateMinutes: route.lateMinutes,
        restockPallets: route.restockPallets || 0,
        loadOrders: route.loadOrders || [],
        etas: route.stops.map((stop) => ({
          orderId: stop.orderId,
          label: stop.label,
          address: stop.address,
          eta: formatClock(stop.etaMinutes),
          depart: typeof stop.departMinutes === "number" ? formatClock(stop.departMinutes) : undefined,
          serviceMinutes: stop.serviceMinutes,
          loadAfter: stop.loadAfter,
          pallets: stop.pallets,
          lateMinutes: stop.lateMinutes,
          type: stop.type,
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
            FLAT 车辆参与排班，客户单按取货场地到客户建模，补货单按砖厂到四个场地建模。
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
              disabled={wholeRoute.isPending || vehicleInput.length === 0 || schedulableCount === 0}
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
                      <span>峰值 {route.load}/{route.capacity} PLT{route.restockPallets > 0 ? ` (+${route.restockPallets} 补货)` : ""}</span>
                    </div>
                    {route.loadOrders.length > 0 && (
                      <div className="mb-1 rounded bg-muted/40 px-2 py-1 text-xs">
                        <span className="font-medium">本车送货：</span>
                        {route.loadOrders.length} 单 · {route.loadOrders.reduce((sum, order) => sum + order.pallets, 0)} PLT
                      </div>
                    )}
                    {route.etas.length > 0 ? (
                      <>
                        <div className="mb-1 text-xs">
                          总行程约 {route.totalMinutes} 分钟 · {route.totalDistanceKm.toFixed(1)} km
                          {route.lateMinutes > 0 && <span className="text-destructive"> · 晚到 {route.lateMinutes} 分钟</span>}
                        </div>
                        <div className="space-y-2">
                          {route.etas.map((eta, index) => (
                            <div key={`${eta.orderId}-${eta.type}-${index}`} className="grid grid-cols-[64px_1fr] gap-2 text-xs">
                              <div className="pt-0.5 text-right text-muted-foreground">
                                <div className="font-medium text-foreground">{eta.eta}</div>
                                {eta.depart && eta.depart !== eta.eta && <div>离 {eta.depart}</div>}
                              </div>
                              <div className={cn("rounded border bg-background px-2 py-1.5", eta.type !== "delivery" && "bg-blue-500/10", eta.lateMinutes > 0 && "border-destructive/40 bg-destructive/5")}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="font-medium">{formatStopAction(eta)}</div>
                                    <div className="mt-0.5 break-words leading-snug">{formatStopAddress(eta)}</div>
                                  </div>
                                  <Badge variant={eta.type === "delivery" ? "outline" : "secondary"} className="shrink-0 text-[10px]">
                                    {eta.pallets} PLT
                                  </Badge>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                  {typeof eta.serviceMinutes === "number" && <span>服务 {eta.serviceMinutes} 分钟</span>}
                                  {typeof eta.loadAfter === "number" && <span>完成后车上 {eta.loadAfter} PLT</span>}
                                  {eta.lateMinutes > 0 && <span className="text-destructive">晚到 {eta.lateMinutes} 分钟</span>}
                                </div>
                              </div>
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
              司机时间按 06:00-23:00；取货/卸货服务时间按 10 + 2 × PLT 分钟；P1/must 为硬时间窗。
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

async function buildLocationLookup(): Promise<LocationLookup> {
  const lookup: LocationLookup = new Map();
  Object.entries(KNOWN_LOCATIONS).forEach(([key, value]) => {
    lookup.set(normalizeLocationKey(key), value);
  });

  const [{ data: yards }, { data: factories }] = await Promise.all([
    supabase.from("company_yards").select("id,name,address"),
    (supabase.from("brick_factories") as any).select("id,name,address"),
  ]);

  ((yards || []) as Array<{ id: string; name: string; address: string }>).forEach((yard) => {
    const value = { label: yard.name, address: yard.address };
    lookup.set(normalizeLocationKey(yard.id), value);
    lookup.set(normalizeLocationKey(yard.name), value);
    const code = yard.name.match(/\b\d{3,5}\b/)?.[0];
    if (code) lookup.set(normalizeLocationKey(code), value);
  });

  ((factories || []) as Array<{ id: string; name: string; address: string }>).forEach((factory) => {
    const value = { label: factory.name, address: factory.address };
    lookup.set(normalizeLocationKey(factory.id), value);
    lookup.set(normalizeLocationKey(factory.name), value);
  });

  return lookup;
}

function buildDeliveryOrder(order: Order, lookup: LocationLookup) {
  const window = parseTimeWindow(order);
  const pickupKeys = getPickupKeys(order);
  const splitPallets = splitPalletCount(order.pallet_count || 0, pickupKeys.length);

  return {
    id: order.id,
    label: orderLabel(order),
    pallets: order.pallet_count || 0,
    pickups: pickupKeys.map((key, index) => {
      const location = resolveLocation(key, lookup, "12441");
      return {
        label: `${location.label} 取 ${orderLabel(order)}`,
        address: location.address,
        pallets: splitPallets[index],
      };
    }),
    deliveryAddress: order.address || "",
    deliveryLabel: orderLabel(order),
    priority: order.priority || "P3",
    startMinutes: window.startMinutes,
    endMinutes: window.endMinutes,
    must: window.must,
    canSplit: order.can_split !== false,
  };
}

function buildRestockOrder(order: Order, lookup: LocationLookup) {
  const pickupText = extractPickupText(order);
  const pickupLocation = resolveLocation(order.origin_factory_id || pickupText || "", lookup);
  const destinationLocation = resolveLocation(
    order.destination_yard_id || destinationCodeFromAddress(order.address) || "",
    lookup,
  );

  if (!pickupLocation.address || !destinationLocation.address) return null;

  return {
    id: order.id,
    label: orderLabel(order),
    pallets: order.pallet_count || 0,
    pickupAddress: pickupLocation.address,
    deliveryAddress: destinationLocation.address,
    pickupLabel: `${pickupLocation.label} 补货`,
    deliveryLabel: `${destinationLocation.label} 卸货`,
    priority: order.priority || "P4",
    endMinutes: ROUTE_END_MINUTES,
  };
}

function getPickupKeys(order: Order) {
  const pickupText = extractPickupText(order);
  const rawKeys = pickupText
    ? pickupText.split("+").map((part) => part.trim()).filter(Boolean)
    : [];

  if (rawKeys.length > 0) return rawKeys;
  if (order.origin_yard_id) return [order.origin_yard_id];
  return ["12441"];
}

function extractPickupText(order: Order) {
  const notes = order.customer_notes || "";
  const match = notes.match(/(?:^|\|\s*)pickup\s+([^|]+)/i);
  return match?.[1]?.trim();
}

function destinationCodeFromAddress(address: string | null) {
  if (!address) return "";
  const trimmed = address.trim();
  if (/^\d{3,5}$/.test(trimmed)) return trimmed;
  return trimmed;
}

function resolveLocation(key: string, lookup: LocationLookup, fallbackKey?: string) {
  const normalized = normalizeLocationKey(key);
  const fallback = fallbackKey ? lookup.get(normalizeLocationKey(fallbackKey)) : undefined;
  if (lookup.has(normalized)) return lookup.get(normalized)!;
  if (KNOWN_LOCATIONS[key.toUpperCase()]) return KNOWN_LOCATIONS[key.toUpperCase()];
  if (isUuidLike(key) && fallback) return fallback;
  return fallback || { label: key || "未知地点", address: key };
}

function normalizeLocationKey(value: string) {
  return (value || "").trim().toUpperCase();
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function splitPalletCount(total: number, parts: number) {
  const count = Math.max(1, parts);
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function buildServiceMinutes(
  deliveryOrders: DeliveryOrderInput[],
  restockOrders: RestockOrderInput[],
) {
  const values = [0];
  deliveryOrders.forEach((order) => {
    order.pickups.forEach((pickup) => values.push(serviceMinutes(pickup.pallets)));
    values.push(serviceMinutes(order.pallets));
  });
  restockOrders.forEach((order) => {
    values.push(serviceMinutes(order.pallets));
    values.push(serviceMinutes(order.pallets));
  });
  return values;
}

function serviceMinutes(pallets: number) {
  return 10 + pallets * 2;
}

function formatStopAction(eta: RouteEta) {
  if (eta.type === "order_pickup") return "取货";
  if (eta.type === "restock_pickup") return "补货取货";
  if (eta.type === "restock_dropoff") return "补货卸货";
  return "送货";
}

function formatStopAddress(eta: RouteEta) {
  return eta.address || eta.label;
}

function parseTimeWindow(order: Order) {
  const raw = `${order.time_window === "custom" ? order.time_window_custom || "" : order.time_window} ${order.customer_notes || ""}`.toLowerCase();
  const priority = order.priority || "P3";
  let startMinutes = ROUTE_START_MINUTES;
  let endMinutes = ROUTE_END_MINUTES;

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
    const inferred = inferRangeSuffixes(Number(range[1]), range[2] || "", Number(range[3]), range[4] || "");
    const startSuffix = inferred.startSuffix;
    const endSuffix = inferred.endSuffix;
    startMinutes = parseHour(range[1], startSuffix);
    endMinutes = parseHour(range[3], endSuffix);
    if (endMinutes <= startMinutes) {
      endMinutes += 12 * 60;
    }
  }

  if (endMinutes <= startMinutes) {
    startMinutes = ROUTE_START_MINUTES;
    endMinutes = ROUTE_END_MINUTES;
  }

  const must = raw.includes("must") || priority === "P1";
  return { startMinutes, endMinutes, must };
}

function inferRangeSuffixes(startHour: number, startSuffix: string, endHour: number, endSuffix: string) {
  if (startSuffix || !endSuffix) {
    return { startSuffix: startSuffix || endSuffix, endSuffix: endSuffix || startSuffix };
  }

  if (endSuffix === "pm") {
    if (startHour === 12) return { startSuffix: "pm", endSuffix };
    if (startHour > endHour) return { startSuffix: "am", endSuffix };
    return { startSuffix: "pm", endSuffix };
  }

  return { startSuffix: endSuffix, endSuffix };
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
