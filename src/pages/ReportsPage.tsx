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
  BarChart3,
  CheckCircle2,
  Clock3,
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
  time_window?: string | null;
  time_window_custom?: string | null;
  customer_notes?: string | null;
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
  actualMinutes: number;
  expectedMinutes: number;
  delayMinutes: number;
};

type DriverSupervisionRow = {
  driver: Driver;
  totalSteps: number;
  doneSteps: number;
  openSteps: number;
  completionRate: number;
  slowSegments: SlowSegment[];
  averageDelayMinutes: number;
  lastCompletedAt: string | null;
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
    queryKey: ["driver-supervision-steps", startISO, todayStr, businessType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_steps")
        .select(
          "id,driver_id,scheduled_date,step_number,step_type,node_type,location,status,completed_at,order_id,orders(id,order_number,type,bin_size,address,status,business_type,pallet_count,time_window,time_window_custom,customer_notes)",
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

  const supervision = useMemo(() => {
    const groups = new Map<string, ReportStep[]>();
    for (const step of reportSteps) {
      const key = `${step.driver_id}|${step.scheduled_date}`;
      const list = groups.get(key) ?? [];
      list.push(step);
      groups.set(key, list);
    }

    const rows = new Map<string, DriverSupervisionRow>();
    for (const driver of drivers) {
      rows.set(driver.id, {
        driver,
        totalSteps: 0,
        doneSteps: 0,
        openSteps: 0,
        completionRate: 0,
        slowSegments: [],
        averageDelayMinutes: 0,
        lastCompletedAt: null,
      });
    }

    const unassignedDriver: Driver = { id: "unknown", name: "未绑定司机" };

    for (const [key, steps] of groups) {
      const [driverId, scheduledDate] = key.split("|");
      const driver = driverById.get(driverId) ?? unassignedDriver;
      const row =
        rows.get(driver.id) ??
        {
          driver,
          totalSteps: 0,
          doneSteps: 0,
          openSteps: 0,
          completionRate: 0,
          slowSegments: [],
          averageDelayMinutes: 0,
          lastCompletedAt: null,
        };

      const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);
      row.totalSteps += sorted.length;
      row.doneSteps += sorted.filter(isStepDone).length;
      row.openSteps += sorted.filter((step) => !isStepDone(step)).length;

      const completed = sorted.filter((step) => step.completed_at);
      for (const step of completed) {
        if (!row.lastCompletedAt || new Date(step.completed_at!).getTime() > new Date(row.lastCompletedAt).getTime()) {
          row.lastCompletedAt = step.completed_at;
        }
      }

      for (let i = 1; i < completed.length; i += 1) {
        const previous = completed[i - 1];
        const current = completed[i];
        const actualMinutes = minutesBetween(previous.completed_at, current.completed_at);
        if (actualMinutes == null) continue;

        const expectedMinutes =
          serviceMinutesForStep(previous) + roughDriveMinutes(previous.location, current.location);
        const delayMinutes = Math.max(0, actualMinutes - expectedMinutes);
        if (delayMinutes > SLOW_BUFFER_MINUTES) {
          row.slowSegments.push({
            id: `${previous.id}-${current.id}`,
            driverId: driver.id,
            driverName: driver.name,
            scheduledDate,
            from: stepLabel(previous),
            to: stepLabel(current),
            actualMinutes,
            expectedMinutes,
            delayMinutes,
          });
        }
      }

      rows.set(driver.id, row);
    }

    const driverRows = Array.from(rows.values())
      .map((row) => {
        const delayTotal = row.slowSegments.reduce((sum, segment) => sum + segment.delayMinutes, 0);
        return {
          ...row,
          completionRate: row.totalSteps ? row.doneSteps / row.totalSteps : 0,
          averageDelayMinutes: row.slowSegments.length ? delayTotal / row.slowSegments.length : 0,
        };
      })
      .filter((row) => row.totalSteps > 0)
      .sort((a, b) => b.slowSegments.length - a.slowSegments.length || b.openSteps - a.openSteps);

    const slowSegments = driverRows.flatMap((row) => row.slowSegments);
    const overdueOpenSteps = reportSteps
      .filter((step) => step.scheduled_date < todayStr && !isStepDone(step))
      .map((step) => ({
        id: step.id,
        driverName: driverById.get(step.driver_id)?.name ?? "未绑定司机",
        scheduledDate: step.scheduled_date,
        label: stepLabel(step),
        location: step.orders?.address || step.location,
      }));

    return {
      rows: driverRows,
      slowSegments,
      overdueOpenSteps,
      totalSteps: reportSteps.length,
      doneSteps: reportSteps.filter(isStepDone).length,
      openSteps: reportSteps.filter((step) => !isStepDone(step)).length,
    };
  }, [drivers, driverById, reportSteps, todayStr]);

  const completionRate = supervision.totalSteps
    ? supervision.doneSteps / supervision.totalSteps
    : 0;

  return (
    <div className="p-6 space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">司机监督报表</h1>
          <p className="text-sm text-muted-foreground mt-1">
            查看司机任务完成率、任务间隔偏慢、历史未完成和执行异常
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
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="完成任务"
          value={`${supervision.doneSteps}/${supervision.totalSteps}`}
          sub={`完成率 ${(completionRate * 100).toFixed(0)}%`}
          tone="text-status-done"
        />
        <StatCard
          icon={<TimerReset className="h-4 w-4" />}
          label="偏慢段"
          value={supervision.slowSegments.length.toString()}
          sub={`超过预估 +${SLOW_BUFFER_MINUTES} 分钟`}
          tone={supervision.slowSegments.length ? "text-amber-600" : "text-status-done"}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="历史未完成"
          value={supervision.overdueOpenSteps.length.toString()}
          sub="昨天以前还未完成"
          tone={supervision.overdueOpenSteps.length ? "text-destructive" : "text-status-done"}
        />
        <StatCard
          icon={<UsersIcon className="h-4 w-4" />}
          label="有任务司机"
          value={supervision.rows.length.toString()}
          sub={`${supervision.openSteps} 个任务进行中`}
          tone="text-primary"
        />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2">
              <UsersIcon className="h-4 w-4" /> 司机监督汇总
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              偏慢按相邻两个已完成打卡之间的实际间隔计算
            </div>
          </div>
        </div>

        {supervision.rows.length === 0 ? (
          <EmptyState text="当前时间范围暂无司机任务" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left font-medium py-2 pr-3">司机</th>
                  <th className="text-left font-medium py-2 pr-3">完成</th>
                  <th className="text-left font-medium py-2 pr-3">完成率</th>
                  <th className="text-left font-medium py-2 pr-3">平均偏慢</th>
                  <th className="text-left font-medium py-2 pr-3">偏慢段</th>
                  <th className="text-left font-medium py-2 pr-3">未完成</th>
                  <th className="text-left font-medium py-2">最近完成</th>
                </tr>
              </thead>
              <tbody>
                {supervision.rows.map((row) => (
                  <tr key={row.driver.id} className="border-b last:border-0">
                    <td className="py-3 pr-3 font-medium">{row.driver.name}</td>
                    <td className="py-3 pr-3">
                      {row.doneSteps}/{row.totalSteps}
                    </td>
                    <td className="py-3 pr-3">
                      <CompletionBar value={row.completionRate} />
                    </td>
                    <td className="py-3 pr-3">
                      {row.averageDelayMinutes ? `${Math.round(row.averageDelayMinutes)} 分钟` : "-"}
                    </td>
                    <td className="py-3 pr-3">
                      <Badge variant={row.slowSegments.length ? "destructive" : "outline"}>
                        {row.slowSegments.length}
                      </Badge>
                    </td>
                    <td className="py-3 pr-3">{row.openSteps}</td>
                    <td className="py-3 text-muted-foreground">{formatDateTime(row.lastCompletedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Route className="h-4 w-4" /> 任务间隔偏慢
          </div>
          {supervision.slowSegments.length === 0 ? (
            <EmptyState text="暂无明显偏慢记录" />
          ) : (
            <div className="space-y-2">
              {supervision.slowSegments.slice(0, 12).map((segment) => (
                <div key={segment.id} className="border rounded-md p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{segment.driverName}</div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {segment.from} {"->"} {segment.to}
                      </div>
                    </div>
                    <Badge variant="destructive" className="shrink-0">
                      +{Math.round(segment.delayMinutes)} 分钟
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {segment.scheduledDate} · 实际 {Math.round(segment.actualMinutes)} 分钟 · 预估{" "}
                    {Math.round(segment.expectedMinutes)} 分钟
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Clock3 className="h-4 w-4" /> 历史未完成
          </div>
          {supervision.overdueOpenSteps.length === 0 ? (
            <EmptyState text="没有历史遗留未完成任务" />
          ) : (
            <div className="space-y-2">
              {supervision.overdueOpenSteps.slice(0, 12).map((step) => (
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
          )}
        </Card>
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4" /> 最近任务明细
        </div>
        {reportSteps.length === 0 ? (
          <EmptyState text="暂无任务明细" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {reportSteps.slice(0, 18).map((step) => (
              <div key={step.id} className="border rounded-md p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium truncate">{stepLabel(step)}</div>
                  <Badge variant={isStepDone(step) ? "outline" : "secondary"} className="shrink-0">
                    {isStepDone(step) ? "已完成" : "未完成"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {driverById.get(step.driver_id)?.name ?? "未绑定司机"} · {step.scheduled_date}
                </div>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {step.orders?.address || step.location}
                </div>
                {step.completed_at && (
                  <div className="text-xs text-muted-foreground mt-1">
                    完成时间 {formatDateTime(step.completed_at)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
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
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </Card>
  );
}

function CompletionBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 min-w-32">
      <div className="h-2 w-24 rounded bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded", pct >= 90 ? "bg-status-done" : pct >= 70 ? "bg-amber-500" : "bg-destructive")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
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

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
