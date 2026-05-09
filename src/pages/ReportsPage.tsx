import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  Truck,
  PackageCheck,
  TrendingUp,
  Users as UsersIcon,
  Calendar,
} from "lucide-react";
import { ORDER_TYPES, todayISO, typeMeta } from "@/lib/business";
import { cn } from "@/lib/utils";
import { BusinessTypeSelector } from "@/components/BusinessTypeSelector";
import { useBusinessType } from "@/lib/business-type-storage";
import type { BusinessType } from "@/lib/business";

// 模拟价目表(没接 NetSuite,先用固定价计算营收估算)
const PRICE_BY_TYPE: Record<string, Record<string, number>> = {
  delivery: { "14": 280, "20": 380, "40": 580 },
  swap: { "14": 320, "20": 420, "40": 620 },
  pickup: { "14": 220, "20": 320, "40": 520 },
  material: { "14": 450, "20": 580, "40": 780 },
};

function rangeStart(period: "day" | "week" | "month") {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === "week") d.setDate(d.getDate() - 6);
  if (period === "month") d.setDate(d.getDate() - 29);
  return d;
}

type Order = {
  id: string;
  order_number: string;
  type: string;
  bin_size: string | null;
  status: string;
  service_date: string;
  created_at: string;
  customer_name: string;
};

type Driver = { id: string; name: string };

type Assignment = {
  id: string;
  driver_id: string;
  scheduled_date: string;
  orders: { id: string; type: string; bin_size: string | null; status: string };
};

type Step = {
  id: string;
  step_type: string;
  weight_kg: number | null;
  dump_site: string | null;
  completed_at: string | null;
};

type BinHistory = {
  id: string;
  bin_id: string;
  event: string;
  recorded_at: string;
};

function priceOf(type: string, size: string | null): number {
  if (!size) return type === "material" ? 350 : 0;
  return PRICE_BY_TYPE[type]?.[size] ?? 0;
}

export function ReportsPage() {
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const [businessType, setBusinessType] = useBusinessType();
  const start = rangeStart(period);
  const startISO = start.toISOString().slice(0, 10);
  const todayStr = todayISO();

  const { data: orders = [] } = useQuery({
    queryKey: ["report-orders", startISO, todayStr, businessType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("business_type", businessType)
        .gte("service_date", startISO)
        .lte("service_date", todayStr);
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["report-assignments", startISO, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatch_assignments")
        .select("id,driver_id,scheduled_date,orders(id,type,bin_size,status)")
        .gte("scheduled_date", startISO)
        .lte("scheduled_date", todayStr);
      if (error) throw error;
      return (data ?? []) as unknown as Assignment[];
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,name")
        .eq("role", "driver")
        .eq("is_active", true);
      if (error) throw error;
      return data as Driver[];
    },
  });

  const { data: dumpSteps = [] } = useQuery({
    queryKey: ["report-dump-steps", startISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_steps")
        .select("id,step_type,weight_kg,dump_site,completed_at")
        .eq("step_type", "dump_site")
        .not("completed_at", "is", null)
        .gte("completed_at", start.toISOString());
      if (error) throw error;
      return (data ?? []) as Step[];
    },
  });

  const { data: binHistory = [] } = useQuery({
    queryKey: ["report-bin-history", startISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bin_history")
        .select("id,bin_id,event,recorded_at")
        .gte("recorded_at", start.toISOString());
      if (error) throw error;
      return (data ?? []) as BinHistory[];
    },
  });

  // ============= 计算 =============
  const stats = useMemo(() => {
    const completed = orders.filter((o) => o.status === "done");
    const revenue = completed.reduce((sum, o) => sum + priceOf(o.type, o.bin_size), 0);
    const byType: Record<string, number> = {};
    for (const o of orders) byType[o.type] = (byType[o.type] || 0) + 1;
    const completionRate = orders.length ? completed.length / orders.length : 0;

    // 按日期分组
    const byDate: Record<string, { total: number; done: number; revenue: number }> = {};
    for (const o of orders) {
      const k = o.service_date;
      if (!byDate[k]) byDate[k] = { total: 0, done: 0, revenue: 0 };
      byDate[k].total += 1;
      if (o.status === "done") {
        byDate[k].done += 1;
        byDate[k].revenue += priceOf(o.type, o.bin_size);
      }
    }
    return {
      revenue,
      completed: completed.length,
      total: orders.length,
      completionRate,
      byType,
      byDate,
    };
  }, [orders]);

  // 司机效率
  const driverStats = useMemo(() => {
    return drivers
      .map((d) => {
        const ass = assignments.filter((a) => a.driver_id === d.id);
        const done = ass.filter((a) => a.orders.status === "done");
        const revenue = done.reduce(
          (s, a) => s + priceOf(a.orders.type, a.orders.bin_size),
          0,
        );
        return { driver: d, total: ass.length, done: done.length, revenue };
      })
      .sort((a, b) => b.done - a.done);
  }, [drivers, assignments]);

  // 桶周转
  const binTurnover = useMemo(() => {
    const byBin: Record<string, number> = {};
    for (const h of binHistory) {
      if (h.event === "delivered" || h.event === "picked_up" || h.event === "swapped_out") {
        byBin[h.bin_id] = (byBin[h.bin_id] || 0) + 1;
      }
    }
    const totalEvents = Object.values(byBin).reduce((s, n) => s + n, 0);
    const activeBins = Object.keys(byBin).length;
    const avg = activeBins ? totalEvents / activeBins : 0;
    return { totalEvents, activeBins, avg };
  }, [binHistory]);

  // 垃圾场吨数
  const dumpStats = useMemo(() => {
    const totalKg = dumpSteps.reduce((s, x) => s + (x.weight_kg ?? 0), 0);
    const bySite: Record<string, { kg: number; trips: number }> = {};
    for (const s of dumpSteps) {
      const site = s.dump_site || "未填写";
      if (!bySite[site]) bySite[site] = { kg: 0, trips: 0 };
      bySite[site].kg += s.weight_kg ?? 0;
      bySite[site].trips += 1;
    }
    return {
      totalKg,
      totalTons: totalKg / 1000,
      trips: dumpSteps.length,
      bySite: Object.entries(bySite).sort((a, b) => b[1].kg - a[1].kg),
    };
  }, [dumpSteps]);

  // 日期序列(用于柱状图)
  const dateKeys = useMemo(() => {
    const days: string[] = [];
    const d = new Date(start);
    const end = new Date();
    while (d <= end) {
      days.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [start]);

  const maxRevenue = Math.max(
    1,
    ...dateKeys.map((k) => stats.byDate[k]?.revenue ?? 0),
  );

  return (
    <div className="p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">运营报表</h1>
          <p className="text-sm text-muted-foreground mt-1">
            营收、效率、桶周转、垃圾场吨数 (价目为内部估算)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <BusinessTypeSelector value={businessType} onChange={setBusinessType} />
          <Select value={period} onValueChange={(v: "day" | "week" | "month") => setPeriod(v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">今天</SelectItem>
              <SelectItem value="week">最近7天</SelectItem>
              <SelectItem value="month">最近30天</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* 概览 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="估算营收"
          value={`$${stats.revenue.toLocaleString()}`}
          sub={`${stats.completed} 单完成`}
          color="primary"
        />
        <StatCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="完成率"
          value={`${(stats.completionRate * 100).toFixed(0)}%`}
          sub={`${stats.completed} / ${stats.total}`}
          color="status-done"
        />
        <StatCard
          icon={<PackageCheck className="h-4 w-4" />}
          label="桶周转"
          value={binTurnover.totalEvents.toString()}
          sub={`${binTurnover.activeBins} 个桶 · 均 ${binTurnover.avg.toFixed(1)} 次`}
          color="type-swap"
        />
        <StatCard
          icon={<Truck className="h-4 w-4" />}
          label="垃圾场吨数"
          value={`${dumpStats.totalTons.toFixed(2)} t`}
          sub={`${dumpStats.trips} 次倾倒`}
          color="type-pickup"
        />
      </div>

      {/* 营收趋势 */}
      <Card className="p-4">
        <div className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4" /> 每日营收趋势
        </div>
        <div className="flex items-end gap-1.5 h-40">
          {dateKeys.map((k) => {
            const v = stats.byDate[k]?.revenue ?? 0;
            const h = (v / maxRevenue) * 100;
            return (
              <div key={k} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition">
                  ${v.toLocaleString()}
                </div>
                <div
                  className="w-full bg-primary/80 rounded-sm hover:bg-primary transition-all"
                  style={{ height: `${Math.max(h, 2)}%` }}
                />
                <div className="text-[10px] text-muted-foreground rotate-[-30deg] origin-top-left">
                  {k.slice(5)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 订单类型分布 */}
        <Card className="p-4">
          <div className="text-sm font-semibold mb-3">按业务类型分布</div>
          <div className="space-y-2">
            {ORDER_TYPES.map((t) => {
              const n = stats.byType[t.value] ?? 0;
              const pct = stats.total ? (n / stats.total) * 100 : 0;
              return (
                <div key={t.value}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="flex items-center gap-1.5">
                      <span>{t.emoji}</span>
                      <span>{t.label}</span>
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {n} 单 · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded overflow-hidden">
                    <div className={cn("h-full rounded", t.className)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 司机效率排行 */}
        <Card className="p-4">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <UsersIcon className="h-4 w-4" /> 司机效率
          </div>
          <div className="space-y-2">
            {driverStats.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">暂无数据</div>
            ) : (
              driverStats.map((d, i) => (
                <div key={d.driver.id} className="flex items-center gap-3">
                  <div className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{d.driver.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      完成 {d.done}/{d.total} 单 · ${d.revenue.toLocaleString()}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {d.total ? Math.round((d.done / d.total) * 100) : 0}%
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* 垃圾场分布 */}
        <Card className="p-4 lg:col-span-2">
          <div className="text-sm font-semibold mb-3">按垃圾场倾倒</div>
          {dumpStats.bySite.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">暂无垃圾场数据</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {dumpStats.bySite.map(([site, info]) => (
                <div key={site} className="border rounded p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{site}</div>
                    <div className="text-xs text-muted-foreground">{info.trips} 次倾倒</div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold">{(info.kg / 1000).toFixed(2)} t</div>
                    <div className="text-[10px] text-muted-foreground">
                      {info.kg.toLocaleString()} kg
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={cn("text-foreground")} style={{ color: `var(--${color})` }}>
          {icon}
        </span>
        {label}
      </div>
      <div className="text-2xl font-bold mt-1.5">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </Card>
  );
}
// silence unused warning when no orders type usage by chance
void typeMeta;
