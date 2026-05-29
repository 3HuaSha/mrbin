import { useMemo, useState, type ReactNode } from "react";
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
  AlertTriangle,
  Clock3,
  MapPin,
  Route,
  TimerReset,
  Users as UsersIcon,
} from "lucide-react";
import { todayISO } from "@/lib/business";
import { cn } from "@/lib/utils";
import { BusinessTypeSelector } from "@/components/BusinessTypeSelector";
import { useBusinessType } from "@/lib/business-type-storage";

function rangeStart(period: "day" | "week" | "month") {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === "week") d.setDate(d.getDate() - 6);
  if (period === "month") d.setDate(d.getDate() - 29);
  return d;
}

type Driver = { id: string; name: string };

type ReportOrder = {
  id: string;
  order_number: string;
  type: string;
  bin_size: string | null;
  address: string;
  status: string;
  business_type?: string | null;
  pallet_count?: number | null;
};

type ReportStep = {
  id: string;
  driver_id: string;
  scheduled_date: string;
  step_number: number;
  step_type: string;
  node_type: "order" | "step" | null;
  location: string;
  status: string | null;
  completed_at: string | null;
  order_id: string | null;
  orders?: ReportOrder | null;
};

type SlowSegment = {
  id: string;
  driverId: string;
  driverName: string;
  scheduledDate: string;
  from: string;
  to: string;
  toLocation: string;
  actualMinutes: number;
  expectedMinutes: number;
  delayMinutes: number;
};

type SlowLocation = {
  key: string;
  label: string;
  location: string;
  count: number;
  totalDelayMinutes: number;
  worstDelayMinutes: number;
  drivers: string[];
};

type SlowDriver = {
  driver: Driver;
  count: number;
  totalDelayMinutes: number;
  worstDelayMinutes: number;
};

const SLOW_BUFFER_MINUTES = 15;

export function ReportsPage() {
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const [businessType, setBusinessType] = useBusinessType();
  const start = rangeStart(period);
  const startISO = start.toISOString().slice(0, 10);
  const todayStr = todayISO();

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

  const { data: reportSteps = [] } = useQuery({
    queryKey: ["slow-point-report-steps", startISO, todayStr, businessType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_steps")
        .select(
          "id,driver_id,scheduled_date,step_number,step_type,node_type,location,status,completed_at,order_id,orders(id,order_number,type,bin_size,address,status,business_type,pallet_count)",
        )
        .gte("scheduled_date", startISO)
        .lte("scheduled_date", todayStr)
        .order("scheduled_date", { ascending: false })
        .order("driver_id")
        .order("step_number");
      if (error) throw error;

      return ((data ?? []) as unknown as ReportStep[]).filter((step) => {
        const stepBusinessType = step.orders?.business_type;
        return !stepBusinessType || stepBusinessType === businessType;
      });
    },
  });

  const driverById = useMemo(() => {
    return new Map(drivers.map((driver) => [driver.id, driver]));
  }, [drivers]);

  const slowReport = useMemo(() => {
    const groups = new Map<string, ReportStep[]>();
    for (const step of reportSteps) {
      const key = `${step.driver_id}|${step.scheduled_date}`;
      const list = groups.get(key) ?? [];
      list.push(step);
      groups.set(key, list);
    }

    const slowSegments: SlowSegment[] = [];

    for (const [key, steps] of groups) {
      const [driverId, scheduledDate] = key.split("|");
      const driver = driverById.get(driverId) ?? { id: driverId, name: "未绑定司机" };
      const completed = [...steps]
        .filter((step) => step.completed_at)
        .sort((a, b) => a.step_number - b.step_number);

      for (let i = 1; i < completed.length; i += 1) {
        const previous = completed[i - 1];
        const current = completed[i];
        const actualMinutes = minutesBetween(previous.completed_at, current.completed_at);
        if (actualMinutes == null) continue;

        const expectedMinutes =
          serviceMinutesForStep(previous) + roughDriveMinutes(previous.location, current.location);
        const delayMinutes = Math.max(0, actualMinutes - expectedMinutes);

        if (delayMinutes > SLOW_BUFFER_MINUTES) {
          slowSegments.push({
            id: `${previous.id}-${current.id}`,
            driverId: driver.id,
            driverName: driver.name,
            scheduledDate,
            from: stepLabel(previous),
            to: stepLabel(current),
            toLocation: stepAddress(current),
            actualMinutes,
            expectedMinutes,
            delayMinutes,
          });
        }
      }
    }

    slowSegments.sort((a, b) => b.delayMinutes - a.delayMinutes);

    const locationMap = new Map<string, SlowLocation>();
    for (const segment of slowSegments) {
      const key = normalizeLocationKey(segment.toLocation || segment.to);
      const existing =
        locationMap.get(key) ??
        {
          key,
          label: segment.to,
          location: segment.toLocation,
          count: 0,
          totalDelayMinutes: 0,
          worstDelayMinutes: 0,
          drivers: [],
        };

      existing.count += 1;
      existing.totalDelayMinutes += segment.delayMinutes;
      existing.worstDelayMinutes = Math.max(existing.worstDelayMinutes, segment.delayMinutes);
      if (!existing.drivers.includes(segment.driverName)) existing.drivers.push(segment.driverName);
      locationMap.set(key, existing);
    }

    const slowLocations = Array.from(locationMap.values()).sort(
      (a, b) => b.totalDelayMinutes - a.totalDelayMinutes || b.count - a.count,
    );

    const driverMap = new Map<string, SlowDriver>();
    for (const driver of drivers) {
      driverMap.set(driver.id, {
        driver,
        count: 0,
        totalDelayMinutes: 0,
        worstDelayMinutes: 0,
      });
    }
    for (const segment of slowSegments) {
      const driver = driverById.get(segment.driverId) ?? { id: segment.driverId, name: segment.driverName };
      const existing =
        driverMap.get(driver.id) ??
        {
          driver,
          count: 0,
          totalDelayMinutes: 0,
          worstDelayMinutes: 0,
        };
      existing.count += 1;
      existing.totalDelayMinutes += segment.delayMinutes;
      existing.worstDelayMinutes = Math.max(existing.worstDelayMinutes, segment.delayMinutes);
      driverMap.set(driver.id, existing);
    }

    const slowDrivers = Array.from(driverMap.values())
      .filter((driver) => driver.count > 0)
      .sort((a, b) => b.totalDelayMinutes - a.totalDelayMinutes || b.count - a.count);

    const overdueOpenSteps = reportSteps
      .filter((step) => step.scheduled_date < todayStr && !isStepDone(step))
      .map((step) => ({
        id: step.id,
        driverName: driverById.get(step.driver_id)?.name ?? "未绑定司机",
        scheduledDate: step.scheduled_date,
        label: stepLabel(step),
        location: stepAddress(step),
      }));

    return {
      slowSegments,
      slowLocations,
      slowDrivers,
      overdueOpenSteps,
      totalDelayMinutes: slowSegments.reduce((sum, segment) => sum + segment.delayMinutes, 0),
    };
  }, [drivers, driverById, reportSteps, todayStr]);

  const worstLocation = slowReport.slowLocations[0];

  return (
    <div className="p-6 space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">司机慢点分析</h1>
          <p className="text-sm text-muted-foreground mt-1">
            重点看哪些地点、哪段任务、哪个司机出现明显偏慢
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<TimerReset className="h-4 w-4" />}
          label="偏慢记录"
          value={slowReport.slowSegments.length.toString()}
          sub={`超过预估 +${SLOW_BUFFER_MINUTES} 分钟才算`}
          tone={slowReport.slowSegments.length ? "text-amber-600" : "text-status-done"}
        />
        <StatCard
          icon={<Clock3 className="h-4 w-4" />}
          label="累计偏慢"
          value={`${Math.round(slowReport.totalDelayMinutes)} 分钟`}
          sub="所有偏慢段合计"
          tone={slowReport.totalDelayMinutes ? "text-amber-600" : "text-status-done"}
        />
        <StatCard
          icon={<MapPin className="h-4 w-4" />}
          label="最慢地点"
          value={worstLocation ? `${Math.round(worstLocation.totalDelayMinutes)} 分钟` : "-"}
          sub={worstLocation ? worstLocation.label : "暂无慢点"}
          tone={worstLocation ? "text-destructive" : "text-status-done"}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="未处理异常"
          value={slowReport.overdueOpenSteps.length.toString()}
          sub="历史任务未打卡"
          tone={slowReport.overdueOpenSteps.length ? "text-destructive" : "text-status-done"}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="p-4 xl:col-span-2">
          <div className="text-sm font-semibold flex items-center gap-2 mb-3">
            <MapPin className="h-4 w-4" /> 慢点排行
          </div>
          {slowReport.slowLocations.length === 0 ? (
            <EmptyState text="当前时间范围暂无明显慢点" />
          ) : (
            <div className="space-y-2">
              {slowReport.slowLocations.slice(0, 10).map((location, index) => (
                <div key={location.key} className="border rounded-md p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-6">#{index + 1}</span>
                        <div className="text-sm font-semibold truncate">{location.label}</div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">{location.location}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {location.count} 次偏慢 · 涉及 {location.drivers.join("、")}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-destructive">
                        +{Math.round(location.totalDelayMinutes)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        最慢 +{Math.round(location.worstDelayMinutes)} 分钟
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold flex items-center gap-2 mb-3">
            <UsersIcon className="h-4 w-4" /> 司机偏慢排行
          </div>
          {slowReport.slowDrivers.length === 0 ? (
            <EmptyState text="暂无司机偏慢记录" />
          ) : (
            <div className="space-y-2">
              {slowReport.slowDrivers.map((driver, index) => (
                <div key={driver.driver.id} className="border rounded-md p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        #{index + 1} {driver.driver.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {driver.count} 段偏慢 · 最慢 +{Math.round(driver.worstDelayMinutes)} 分钟
                      </div>
                    </div>
                    <Badge variant="destructive" className="shrink-0">
                      +{Math.round(driver.totalDelayMinutes)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Route className="h-4 w-4" /> 偏慢明细
        </div>
        {slowReport.slowSegments.length === 0 ? (
          <EmptyState text="暂无明显偏慢明细" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left font-medium py-2 pr-3">日期</th>
                  <th className="text-left font-medium py-2 pr-3">司机</th>
                  <th className="text-left font-medium py-2 pr-3">从哪里</th>
                  <th className="text-left font-medium py-2 pr-3">慢在哪</th>
                  <th className="text-left font-medium py-2 pr-3">地址</th>
                  <th className="text-left font-medium py-2 pr-3">实际/预估</th>
                  <th className="text-left font-medium py-2">偏慢</th>
                </tr>
              </thead>
              <tbody>
                {slowReport.slowSegments.slice(0, 30).map((segment) => (
                  <tr key={segment.id} className="border-b last:border-0">
                    <td className="py-3 pr-3 text-muted-foreground">{segment.scheduledDate}</td>
                    <td className="py-3 pr-3 font-medium">{segment.driverName}</td>
                    <td className="py-3 pr-3">{segment.from}</td>
                    <td className="py-3 pr-3">{segment.to}</td>
                    <td className="py-3 pr-3 max-w-xs truncate text-muted-foreground">{segment.toLocation}</td>
                    <td className="py-3 pr-3 text-muted-foreground">
                      {Math.round(segment.actualMinutes)} / {Math.round(segment.expectedMinutes)} 分钟
                    </td>
                    <td className="py-3">
                      <Badge variant="destructive">+{Math.round(segment.delayMinutes)} 分钟</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {slowReport.overdueOpenSteps.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-semibold flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4" /> 历史未打卡
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {slowReport.overdueOpenSteps.slice(0, 12).map((step) => (
              <div key={step.id} className="border rounded-md p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{step.driverName}</div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">{step.label}</div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">{step.location}</div>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {step.scheduledDate}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={cn(tone)}>{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-bold mt-1.5">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground py-8 text-center">{text}</div>;
}

function isStepDone(step: ReportStep) {
  return step.status === "done" || Boolean(step.completed_at);
}

function stepLabel(step: ReportStep) {
  return step.orders?.order_number || STEP_TYPE_LABELS[step.step_type] || step.step_type;
}

function stepAddress(step: ReportStep) {
  return step.orders?.address || step.location;
}

function serviceMinutesForStep(step: ReportStep) {
  const pallets = Number(step.orders?.pallet_count || 0);
  if (pallets > 0) return 10 + pallets * 2;
  if (step.step_type.includes("dump")) return 25;
  return 15;
}

function minutesBetween(from?: string | null, to?: string | null) {
  if (!from || !to) return null;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / 60_000;
}

function roughDriveMinutes(from: string, to: string) {
  const fromZone = areaZone(from);
  const toZone = areaZone(to);
  if (fromZone === toZone) return 25;
  if (fromZone === "yard" || toZone === "yard") return 40;
  return 60;
}

function areaZone(value: string) {
  const text = value.toLowerCase();
  if (/\b(12441|3445|2967|150)\b/.test(text)) return "yard";
  if (/oakville|milton|mississauga|brampton|caledon|georgetown|burlington/.test(text)) return "west";
  if (/pickering|ajax|whitby|oshawa|scarborough/.test(text)) return "east";
  if (/vaughan|thornhill|markham|richmond hill|woodbridge|stouffville|bradford/.test(text)) return "north";
  if (/toronto|etobicoke|north york|downtown/.test(text)) return "central";
  if (/ottawa|kanata/.test(text)) return "far";
  return "unknown";
}

function normalizeLocationKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const STEP_TYPE_LABELS: Record<string, string> = {
  depot_pickup: "场地取货",
  customer_delivery: "客户送达",
  customer_pickup: "客户取回",
  dump_site: "垃圾场",
  dump_waste: "倒垃圾",
  delivery: "送货",
  pickup: "取货",
  swap: "换桶",
};
