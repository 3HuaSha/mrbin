import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, CheckCircle2, ArrowRight, LogOut, Truck, MapPin, Download, Share2, X } from "lucide-react";
import { STEP_TYPE_EMOJI, STEP_TYPE_LABEL, todayISO, typeMeta } from "@/lib/business";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/use-current-user";
import { usePWA } from "@/hooks/use-pwa";

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
  const { canInstall, isInstalled, isIOS, promptInstall } = usePWA();
  const [dismissInstallHint, setDismissInstallHint] = useState(false);

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
        .not("node_type", "is", null)
        .order("step_number");
      if (error) throw error;
      return (data ?? []) as unknown as StepRow[];
    },
  });

  // 实时订阅: 当调度员分配/修改任务时, 司机端自动刷新
  useEffect(() => {
    if (!driverId) return;
    const channel = supabase
      .channel(`driver-steps-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_steps',
          filter: `driver_id=eq.${driverId}`,
        },
        () => { refetch(); }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dispatch_assignments',
          filter: `driver_id=eq.${driverId}`,
        },
        () => { refetch(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [driverId, refetch]);

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
        {!isInstalled && !dismissInstallHint && (
          <div className="bg-primary text-primary-foreground rounded-lg p-3 flex items-start gap-2">
            <div className="shrink-0 mt-0.5">
              {isIOS ? <Share2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
            </div>
            <div className="flex-1 text-xs leading-relaxed">
              <div className="font-semibold text-sm mb-0.5">把司机端装到主屏幕</div>
              {isIOS ? (
                <span>Safari 底部分享按钮 → 添加到主屏幕，图标跟 App 一样。</span>
              ) : canInstall ? (
                <span>装上后从桌面图标直接打开，全屏无浏览器栏。</span>
              ) : (
                <span>Chrome 右上角菜单 → 安装应用（或"添加到主屏幕"）。</span>
              )}
            </div>
            {canInstall && !isIOS && (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 px-2 text-xs"
                onClick={async () => {
                  await promptInstall();
                }}
              >
                安装
              </Button>
            )}
            <button
              className="shrink-0 p-1 text-primary-foreground/70 hover:text-primary-foreground"
              aria-label="关闭"
              onClick={() => setDismissInstallHint(true)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

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

        <div className="relative flex flex-col gap-3 py-2">
          {(() => {
            const currentIndex = stepsWithLockStatus.findIndex((s) => s.status !== "done");
            const activeIndex = currentIndex === -1 ? stepsWithLockStatus.length : currentIndex;

            return stepsWithLockStatus.map((s, index) => {
              if (index < activeIndex - 1 || index > activeIndex + 1) return null;

              const isOrderNode = s.node_type === 'order' && s.orders;
              const tm = isOrderNode ? typeMeta(s.orders!.type) : null;
              const isDone = s.status === "done";
              const isLocked = s.isLocked;
              const isPending = s.status !== "done";
              
              const isCurrent = index === activeIndex;
              const isPrev = index === activeIndex - 1;
              const isNext = index === activeIndex + 1;
              
              // 步骤类型标签
              const stepTypeLabels: Record<string, string> = {
                'pickup_bin': '取桶', 'drop_bin': '放桶', 'dump_waste': '倒垃圾',
                'load_material': '装料', 'unload_material': '卸料', 'depot_pickup': '仓库取桶',
                'customer_delivery': '送到客户', 'customer_pickup': '去客户取桶', 'dump_site': '去垃圾场',
                'pickup': '取货', 'delivery': '送货', 'swap': '换桶',
              };
              const orderTypeLabels: Record<string, string> = {
                'delivery': '送桶', 'pickup': '收桶', 'swap': '换桶', 'material': '物料',
              };
              const stepLabel = isOrderNode
                ? (s.orders!.type === 'material' 
                    ? (stepTypeLabels[s.step_type] || s.step_type)
                    : (orderTypeLabels[s.orders!.type] || stepTypeLabels[s.step_type] || s.step_type))
                : (stepTypeLabels[s.step_type] || s.step_type);
              
              const binTypeNames: Record<string, string> = {
                'garbage': '垃圾桶', 'brick': '砖桶', 'soil': '土桶', 'cement': '水泥桶', 'asphalt': '沥青桶',
              };
              const binTypeName = isOrderNode && s.orders?.bin_type ? binTypeNames[s.orders.bin_type] || s.orders.bin_type : '';
              
              return (
                <div key={s.id} className="w-full flex flex-col items-center">
                  {/* 连接线 */}
                  {index > activeIndex - 1 && index <= activeIndex + 1 && (
                    <div className="h-4 w-[2px] bg-border/50 my-1 rounded-full" />
                  )}

                  <div
                    className={cn(
                      "w-full rounded-2xl overflow-hidden transition-all duration-500",
                      isCurrent && "border-primary border-2 shadow-xl shadow-primary/10 bg-card translate-y-0 scale-100 opacity-100",
                      isPrev && "border border-border/50 bg-muted/30 scale-[0.96] opacity-60 blur-[0.5px]",
                      isNext && "border border-dashed border-border bg-card/50 scale-[0.96] opacity-60 blur-[0.5px]"
                    )}
                  >
                    <div className={cn(
                      "text-[11px] font-bold px-4 py-1.5 flex items-center gap-2",
                      isCurrent ? "bg-primary text-primary-foreground" :
                      isPrev ? "bg-muted text-muted-foreground" :
                      "bg-muted/50 text-muted-foreground"
                    )}>
                      {isCurrent && <><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-primary-foreground"></span></span> 当前任务</>}
                      {isPrev && "✓ 上一个任务"}
                      {isNext && "⏳ 下一个任务"}
                    </div>

                    <div className={cn("p-4 flex items-start gap-3", isPrev && "grayscale-[0.5]")}>
                      <div
                        className={cn(
                          "h-12 w-12 rounded-full font-bold flex items-center justify-center shrink-0 text-lg shadow-sm",
                          isDone
                            ? "bg-status-done text-primary-foreground"
                            : isLocked
                            ? "bg-muted text-muted-foreground"
                            : "bg-primary text-primary-foreground",
                        )}
                      >
                        {isDone ? <CheckCircle2 className="h-6 w-6" /> : isLocked ? <Lock className="h-5 w-5" /> : s.step_number}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        {isOrderNode ? (
                          <>
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <Badge className={cn("text-[10px] shadow-sm", tm?.className)}>{tm?.label}</Badge>
                            </div>
                            <div className="text-base font-bold tracking-tight text-foreground/90">
                              {STEP_TYPE_EMOJI[s.step_type] || tm?.emoji} {stepLabel} {s.orders!.bin_size ? `${s.orders!.bin_size}yd` : ""} {binTypeName}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed flex items-start gap-1">
                              <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                              <span>{s.location}</span>
                            </div>
                            {s.orders!.customer_notes && isPending && !isLocked && (
                              <div className="mt-3 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md px-3 py-2 border border-amber-500/20 flex gap-2">
                                <span className="shrink-0">📝</span> 
                                <span className="leading-relaxed">{s.orders!.customer_notes}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <Badge variant="outline" className="text-[10px] shadow-sm">手动步骤</Badge>
                            </div>
                            <div className="text-base font-bold tracking-tight text-foreground/90">
                              {STEP_TYPE_EMOJI[s.step_type] || '📍'} {stepLabel}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed flex items-start gap-1">
                              <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                              <span>{s.location}</span>
                            </div>
                            {s.notes && isPending && !isLocked && (
                              <div className="mt-3 text-xs bg-muted rounded-md px-3 py-2 border flex gap-2">
                                <span className="shrink-0">📝</span>
                                <span className="leading-relaxed">{s.notes}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {isCurrent && isPending && !isLocked && (
                      <div className="p-3 pt-0">
                        <Link
                          to="/driver/step/$stepId"
                          params={{ stepId: s.id }}
                          className="flex items-center justify-center w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all py-3.5 rounded-xl font-bold text-[15px] active:scale-[0.98]"
                        >
                          开始执行任务 <ArrowRight className="inline h-5 w-5 ml-1.5" />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>

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
