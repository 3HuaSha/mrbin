import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayISO } from "@/lib/business";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Truck, MapPin, Activity, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";

// 简易"地图"用一个固定的多伦多区域 bounding box,点位映射到 SVG 像素
// 真实地图等用户提供 Google Maps Key 时再替换
const MAP_BOUNDS = {
  minLat: 43.55, // 南
  maxLat: 43.95, // 北
  minLng: -79.7, // 西
  maxLng: -79.1, // 东
};

const KENNEDY_DEPOT = { lat: 43.7568, lng: -79.2865, label: "Kennedy Depot" };

// driver_locations 表 row
type Loc = {
  id: string;
  driver_id: string;
  vehicle_id: string | null;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  heading: number | null;
  recorded_at: string;
};

type Driver = { id: string; name: string };
type Vehicle = { id: string; name: string; type: string; plate: string };

type Assignment = {
  id: string;
  driver_id: string;
  sequence: number;
  orders: { order_number: string; address: string; type: string };
};

const COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ea580c",
  "#9333ea",
  "#0891b2",
  "#ca8a04",
  "#db2777",
];

function projectPoint(lat: number, lng: number, w: number, h: number) {
  const x = ((lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * w;
  const y = h - ((lat - MAP_BOUNDS.minLat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * h;
  return { x, y };
}

export function FleetMapPage() {
  const [date, setDate] = useState(todayISO());
  const [now, setNow] = useState(Date.now());

  // 自动刷新
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,name")
        .eq("role", "driver")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Driver[];
    },
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*");
      if (error) throw error;
      return data as Vehicle[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["map-assignments", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatch_assignments")
        .select("id,driver_id,sequence,orders(order_number,address,type)")
        .eq("scheduled_date", date)
        .order("sequence");
      if (error) throw error;
      return (data ?? []) as unknown as Assignment[];
    },
  });

  // 每个司机最近一条位置
  const { data: latestLocs = [], refetch: refetchLocs } = useQuery({
    queryKey: ["latest-locations", now],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_locations")
        .select("*")
        .gte("recorded_at", new Date(Date.now() - 24 * 3600_000).toISOString())
        .order("recorded_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const seen = new Set<string>();
      const result: Loc[] = [];
      for (const row of (data ?? []) as Loc[]) {
        if (!seen.has(row.driver_id)) {
          seen.add(row.driver_id);
          result.push(row);
        }
      }
      return result;
    },
  });

  const driverColor = (driverId: string) => {
    const idx = drivers.findIndex((d) => d.id === driverId);
    return COLORS[idx % COLORS.length] ?? "#2563eb";
  };

  const driverAssignments = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    for (const a of assignments) {
      (map[a.driver_id] ??= []).push(a);
    }
    return map;
  }, [assignments]);

  const driverStatus = (driverId: string) => {
    const loc = latestLocs.find((l) => l.driver_id === driverId);
    if (!loc) return { online: false, label: "离线", minutesAgo: null as number | null };
    const minutesAgo = Math.floor((Date.now() - new Date(loc.recorded_at).getTime()) / 60_000);
    return {
      online: minutesAgo < 5,
      label: minutesAgo < 1 ? "实时" : `${minutesAgo}分钟前`,
      minutesAgo,
    };
  };

  // SVG 视口
  const W = 800;
  const H = 600;

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">实时车队地图</h1>
          <p className="text-sm text-muted-foreground mt-1">
            司机位置每30秒自动上报,看板每10秒刷新
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 px-3 rounded-md border bg-background text-sm"
          />
          <Button variant="outline" size="sm" onClick={() => refetchLocs()}>
            <RefreshCcw className="h-4 w-4 mr-1" /> 刷新
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-4">
        {/* 地图 */}
        <Card className="p-3 overflow-hidden">
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
            <MapPin className="h-3 w-3" />
            多伦多东区 ({MAP_BOUNDS.minLat}°N~{MAP_BOUNDS.maxLat}°N,{" "}
            {Math.abs(MAP_BOUNDS.maxLng)}°W~{Math.abs(MAP_BOUNDS.minLng)}°W) · 接 Google
            Maps Key 可换真实底图
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-[600px] bg-[oklch(0.97_0.01_240)] rounded-md border"
          >
            {/* 网格线 */}
            <g stroke="oklch(0.9 0.01 240)" strokeWidth="0.5">
              {Array.from({ length: 11 }).map((_, i) => {
                const x = (W / 10) * i;
                return <line key={`v${i}`} x1={x} y1={0} x2={x} y2={H} />;
              })}
              {Array.from({ length: 9 }).map((_, i) => {
                const y = (H / 8) * i;
                return <line key={`h${i}`} x1={0} y1={y} x2={W} y2={y} />;
              })}
            </g>

            {/* 主要道路示意 (401, DVP, 等) */}
            <g stroke="oklch(0.7 0.02 240)" strokeWidth="2" fill="none" opacity="0.4">
              <line x1={0} y1={H * 0.45} x2={W} y2={H * 0.45} /> {/* 401 */}
              <line x1={W * 0.5} y1={0} x2={W * 0.5} y2={H} /> {/* Yonge */}
              <line x1={W * 0.7} y1={0} x2={W * 0.7} y2={H} /> {/* DVP */}
            </g>

            {/* Depot */}
            {(() => {
              const p = projectPoint(KENNEDY_DEPOT.lat, KENNEDY_DEPOT.lng, W, H);
              return (
                <g>
                  <rect
                    x={p.x - 14}
                    y={p.y - 14}
                    width={28}
                    height={28}
                    fill="oklch(0.45 0.15 255)"
                    rx={4}
                  />
                  <text
                    x={p.x}
                    y={p.y + 5}
                    textAnchor="middle"
                    fill="white"
                    fontSize="14"
                    fontWeight="bold"
                  >
                    🏭
                  </text>
                  <text
                    x={p.x}
                    y={p.y + 28}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill="oklch(0.3 0.05 255)"
                  >
                    Kennedy Depot
                  </text>
                </g>
              );
            })()}

            {/* 司机位置 */}
            {drivers.map((d) => {
              const loc = latestLocs.find((l) => l.driver_id === d.id);
              if (!loc) return null;
              const color = driverColor(d.id);
              const p = projectPoint(loc.lat, loc.lng, W, H);
              const status = driverStatus(d.id);
              if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) return null;
              return (
                <g key={d.id}>
                  {status.online && (
                    <circle cx={p.x} cy={p.y} r={18} fill={color} opacity={0.2}>
                      <animate
                        attributeName="r"
                        values="14;22;14"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={11}
                    fill={color}
                    stroke="white"
                    strokeWidth={2}
                  />
                  <text
                    x={p.x}
                    y={p.y + 4}
                    textAnchor="middle"
                    fill="white"
                    fontSize="11"
                    fontWeight="bold"
                  >
                    🚛
                  </text>
                  <text
                    x={p.x}
                    y={p.y - 16}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill={color}
                  >
                    {d.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </Card>

        {/* 司机列表 */}
        <Card className="p-3 space-y-2 max-h-[700px] overflow-auto">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Truck className="h-4 w-4" />
            司机状态 ({drivers.length})
          </div>
          {drivers.map((d) => {
            const loc = latestLocs.find((l) => l.driver_id === d.id);
            const vehicle = vehicles.find((v) => v.id === loc?.vehicle_id);
            const status = driverStatus(d.id);
            const ass = driverAssignments[d.id] ?? [];
            const color = driverColor(d.id);
            return (
              <div
                key={d.id}
                className="border rounded-lg p-2.5 space-y-1.5"
                style={{ borderLeftWidth: 4, borderLeftColor: color }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-sm">{d.name}</div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      status.online
                        ? "border-status-done/40 text-status-done"
                        : "border-muted-foreground/30 text-muted-foreground",
                    )}
                  >
                    <Activity className="h-2.5 w-2.5 mr-0.5" />
                    {status.label}
                  </Badge>
                </div>
                {vehicle && (
                  <div className="text-xs text-muted-foreground">
                    {vehicle.name} · {vehicle.plate}
                  </div>
                )}
                {loc?.speed_kmh != null && status.online && (
                  <div className="text-[11px] text-muted-foreground">
                    速度 {loc.speed_kmh.toFixed(0)} km/h
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground">
                  今日 {ass.length} 单
                  {ass.length > 0 && (
                    <span className="ml-1">
                      ·{" "}
                      {ass
                        .slice(0, 2)
                        .map((a) => a.orders.order_number)
                        .join(", ")}
                      {ass.length > 2 && ` +${ass.length - 2}`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {drivers.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-6">无活跃司机</div>
          )}
        </Card>
      </div>
    </div>
  );
}
