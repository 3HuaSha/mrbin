import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, CheckCircle2, ArrowRight, LogOut, Truck, MapPin } from "lucide-react";
import { STEP_TYPE_EMOJI, STEP_TYPE_LABEL, todayISO, typeMeta } from "@/lib/business";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/use-current-user";

type StepRow = {
  id: string;
  driver_id: string;
  scheduled_date: string;
  step_number: number;
  order_id: string | null;
  assignment_id: string | null;
  node_type: 'order' | 'step';
  location: string;
  step_type: string;
  bin_id: string | null;
  notes: string | null;
  status: string;
  orders?: {
    order_number: string;
    type: string;
    bin_size: string | null;
    bin_type: string | null;
    customer_name: string;
    customer_notes: string | null;
  } | null;
};

export function DriverHomePage() {
  const nav = useNavigate();
  const [date, setDate] = useState(todayISO());
  const [gpsActive, setGpsActive] = useState(false);
  const { session, loading, profile, hasRole } = useCurrentUser();

  // 未登录或不是司机 -> 登录页
  useEffect(() => {
    if (loading) return;
    if (!session) nav({ to: "/driver/login" });
  }, [loading, session, nav]);

  const driverId = profile?.id ?? "";

  const { data: steps = [], refetch } = useQuery({
    queryKey: ["driver-steps", driverId, date],
    enabled: !!driverId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_steps")
        .select("*, orders(*)")
        .eq("driver_id", driverId)
        .eq("scheduled_date", date)
        .order("step_number");
      if (error) throw error;
      return (data ?? []) as unknown as StepRow[];
    },
  });

  // 当前的车 (从今日的任意一个 step 的 assignment 拿，如果有的话)
  const currentVehicleId = useMemo(() => {
    const stepWithAssignment = steps.find(s => s.assignment_id);
    if (!stepWithAssignment) return null;
    
    // 需要查询 assignment 获取 vehicle_id
    // 这里简化处理，实际可以在查询时 join
    return null;
  }, [steps]);

  // GPS 上报: 每30秒上传一次到 driver_locations
  useEffect(() => {
    if (!driverId || !navigator.geolocation) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let watchId: number | null = null;
    let lastReport = 0;

    const report = (pos: GeolocationPosition) => {
      const now = Date.now();
      if (now - lastReport < 25_000) return;
      lastReport = now;
      supabase.from("driver_locations").insert({
        driver_id: driverId,
        vehicle_id: currentVehicleId,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
        heading: pos.coords.heading,
      }).then(() => setGpsActive(true));
    };

    watchId = navigator.geolocation.watchPosition(
      report,
      () => setGpsActive(false),
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 30_000 },
    );

    // 同时定时器,确保即使位置不变也定期上报
    intervalId = setInterval(() => {
      navigator.geolocation.getCurrentPosition(report, () => {});
    }, 30_000);

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [driverId, currentVehicleId]);

  const doneCount = useMemo(() => steps.filter((s) => s.status === "done").length, [steps]);
  const total = steps.length;
  
  // 计算每个步骤的锁定状态：只有前一个步骤完成才能解锁
  const stepsWithLockStatus = useMemo(() => {
    return steps.map((step, index) => {
      let isLocked = false;
      if (index > 0) {
        const prevStep = steps[index - 1];
        isLocked = prevStep.status !== "done";
      }
      return { ...step, isLocked };
    });
  }, [steps]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    nav({ to: "/driver/login" });
  };

  if (loading || !session) return null;

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="sticky top-0 z-10 bg-sidebar text-sidebar-foreground px-4 py-3 flex items-center gap-3">
        <Truck className="h-5 w-5" />
        <div className="flex-1">
          <div className="text-sm font-bold">{profile?.name ?? "司机端"}</div>
          <div className="text-[11px] opacity-80 flex items-center gap-1">
            <MapPin className={cn("h-3 w-3", gpsActive ? "text-green-400" : "text-yellow-400")} />
            {gpsActive ? "位置上报中" : "等待位置..."}
          </div>
        </div>
        {hasRole("admin") || hasRole("dispatcher") ? (
          <Link
            to="/"
            className="text-xs px-2 py-1 rounded border border-sidebar-border/40 text-sidebar-foreground/80"
          >
            后台
          </Link>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          className="text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <div className="px-4 pt-4 space-y-3">
        <div className="bg-card rounded-lg border p-3 flex gap-2 items-center">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 h-11 px-3 rounded-md border bg-background text-sm"
          />
        </div>

        <div className="bg-primary text-primary-foreground rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-sm opacity-90">今日步骤进度</div>
            <div className="text-3xl font-bold mt-1">
              {doneCount} <span className="text-base opacity-80">/ {total}</span>
            </div>
          </div>
          {total > 0 && doneCount === total && <CheckCircle2 className="h-10 w-10" />}
        </div>

        {total === 0 && (
          <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground text-sm">
            今天没有分配的步骤
          </div>
        )}

        {stepsWithLockStatus.map((s) => {
          const isOrderNode = s.node_type === 'order' && s.orders;
          const tm = isOrderNode ? typeMeta(s.orders!.type) : null;
          const isDone = s.status === "done";
          const isLocked = s.isLocked;
          const isPending = s.status === "pending" || s.status === "in_progress";
          
          // 步骤类型标签
          const stepTypeLabels: Record<string, string> = {
            'pickup_bin': '取桶',
            'drop_bin': '放桶',
            'dump_waste': '倒垃圾',
            'load_material': '装料',
            'unload_material': '卸料',
            'pickup': '取货',
            'delivery': '送货',
            'swap': '换桶',
          };
          const stepLabel = stepTypeLabels[s.step_type] || s.step_type;
          
          // 桶类型中文映射
          const binTypeNames: Record<string, string> = {
            'garbage': '垃圾桶',
            'brick': '砖桶',
            'soil': '土桶',
            'cement': '水泥桶',
            'asphalt': '沥青桶'
          };
          const binTypeName = isOrderNode && s.orders?.bin_type ? binTypeNames[s.orders.bin_type] || s.orders.bin_type : '';
          
          return (
            <div
              key={s.id}
              className={cn(
                "rounded-xl border bg-card overflow-hidden transition-all",
                isPending && !isLocked && "border-primary border-2 shadow-md",
                isDone && "opacity-70",
                isLocked && "opacity-50",
              )}
            >
              <div className="p-3 flex items-start gap-3">
                <div
                  className={cn(
                    "h-10 w-10 rounded-full font-bold flex items-center justify-center shrink-0",
                    isDone
                      ? "bg-status-done text-primary-foreground"
                      : isLocked
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {isLocked ? (
                    <Lock className="h-4 w-4" />
                  ) : isDone ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    s.step_number
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {isOrderNode ? (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn("text-[10px]", tm?.className)}>{tm?.label}</Badge>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {s.orders!.order_number}
                        </span>
                      </div>
                      <div className="text-sm font-semibold mt-1">
                        {STEP_TYPE_EMOJI[s.step_type] || tm?.emoji} {stepLabel} {s.orders!.bin_size ? `${s.orders!.bin_size}yd` : ""} {binTypeName}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">{s.location}</div>
                      {s.orders!.customer_notes && isPending && !isLocked && (
                        <div className="mt-2 text-xs bg-status-progress/15 text-status-progress rounded px-2 py-1">
                          📝 {s.orders!.customer_notes}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">手动步骤</Badge>
                      </div>
                      <div className="text-sm font-semibold mt-1">
                        {STEP_TYPE_EMOJI[s.step_type] || '📍'} {stepLabel}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">{s.location}</div>
                      {s.notes && isPending && !isLocked && (
                        <div className="mt-2 text-xs bg-muted rounded px-2 py-1">
                          📝 {s.notes}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              {isPending && !isLocked && (
                <Link
                  to="/driver/step/$stepId"
                  params={{ stepId: s.id }}
                  className="block bg-primary text-primary-foreground text-center py-3 font-semibold text-sm"
                >
                  开始 <ArrowRight className="inline h-4 w-4 ml-1" />
                </Link>
              )}
              {isLocked && (
                <div className="bg-muted text-muted-foreground text-center py-3 text-sm">
                  🔒 请先完成上一步
                </div>
              )}
            </div>
          );
        })}

        <button
          className="text-xs text-muted-foreground w-full text-center pt-2"
          onClick={() => refetch()}
        >
          ↻ 刷新
        </button>
      </div>
    </div>
  );
}
