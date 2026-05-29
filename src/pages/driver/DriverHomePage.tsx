import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, CheckCircle2, ArrowRight, LogOut, Truck, MapPin, Download, Share2, X, Clock } from "lucide-react";
import { STEP_TYPE_EMOJI, STEP_TYPE_LABEL, todayISO, typeMeta } from "@/lib/business";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/use-current-user";
import { usePWA } from "@/hooks/use-pwa";
import { getCachedRouteMatrix } from "@/actions/route-matrix";
import { formatETA, formatETATime } from "@/lib/eta-calculator";
import { getFullAddress } from "@/lib/manual-step-locations";

function normalizeEtaAddress(address: string) {
  const trimmed = address.trim();
  if (/\b(on|ontario|canada)\b/i.test(trimmed) || trimmed.includes(",")) return trimmed;
  return `${trimmed}, ON, Canada`;
}

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
  const [currentLocation, setCurrentLocation] = useState<{lat: number; lng: number} | null>(null);
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

  const doneCount = useMemo(() => steps.filter((s: any) => s.status === "done").length, [steps]);
  const total = steps.length;
  
  // 计算每个步骤的锁定状态：只有前一个步骤完成才能解锁
  const stepsWithLockStatus = useMemo(() => {
    return steps.map((step: any, index: number) => {
      let isLocked = false;
      if (index > 0) {
        const prevStep = steps[index - 1];
        isLocked = prevStep.status !== "done";
      }
      return { ...step, isLocked };
    });
  }, [steps]);

  // ETA 查询逻辑
  const pendingSteps = useMemo(() => stepsWithLockStatus.filter((s: any) => s.status !== "done"), [stepsWithLockStatus]);
  const activeStep = pendingSteps[0];
  const nextStep = pendingSteps[1];
  
  const { data: etas } = useQuery({
    queryKey: ["driver-etas", driverId, currentLocation, activeStep?.id, nextStep?.id],
    enabled: !!currentLocation && !!activeStep,
    refetchInterval: 300_000, // 5分钟重新计算一次
    queryFn: async () => {
      if (!currentLocation) return null;
      
      const addressesToCalc: { id: string; address: string }[] = [];
      
      const addStepAddress = (s: typeof activeStep) => {
        if (!s) return;
        if (s.node_type === 'order' && s.orders) {
          addressesToCalc.push({ id: s.id, address: normalizeEtaAddress(s.orders.address) });
        } else if (s.node_type === 'step' && s.location) {
          addressesToCalc.push({ id: s.id, address: normalizeEtaAddress(getFullAddress(s.location)) });
        }
      };

      addStepAddress(activeStep);
      addStepAddress(nextStep);

      if (addressesToCalc.length === 0) return null;

      const currentAddress = `${currentLocation.lat},${currentLocation.lng}`;
      const routeAddresses = [currentAddress, ...addressesToCalc.map((step) => step.address)];
      const routePairs = routeAddresses.slice(1).map((address, index) => ({
        from: routeAddresses[index],
        to: address,
      }));

      const matrix = await getCachedRouteMatrix({ data: { addresses: routeAddresses, pairs: routePairs } });
      if (!matrix.success || !matrix.entries) return null;

      let cumulativeSeconds = 0;
      const now = Date.now();
      const STOP_DURATION_SECONDS = 15 * 60; // 15分钟作业时间
      
      const result: Record<string, string> = {};
      
      addressesToCalc.forEach((step, index) => {
        const fromAddress = index === 0 ? currentAddress : addressesToCalc[index - 1].address;
        const leg = matrix.entries.find((e: any) => e.from === fromAddress && e.to === step.address);
        
        const driveSeconds = Math.round((leg?.duration || 0) * 1.2); // 卡车速度补偿
        cumulativeSeconds += driveSeconds;
        
        result[step.id] = new Date(now + cumulativeSeconds * 1000).toISOString();
        
        cumulativeSeconds += STOP_DURATION_SECONDS;
      });

      return result;
    }
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    nav({ to: "/driver/login" });
  };

  if (loading || !session) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background pb-12 font-sans">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="bg-primary/10 p-2 rounded-full">
          <Truck className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="text-base font-bold tracking-tight">{profile?.name ?? "司机端"}</div>
          <div className="text-xs flex items-center gap-1.5 mt-0.5">
            <span className="relative flex h-2 w-2">
              {gpsActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
              <span className={cn("relative inline-flex rounded-full h-2 w-2", gpsActive ? "bg-green-500" : "bg-yellow-500")}></span>
            </span>
            <span className={cn("font-medium", gpsActive ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400")}>
              {gpsActive ? "位置更新中" : "等待位置信号"}
            </span>
          </div>
        </div>
        {hasRole("admin") || hasRole("dispatcher") ? (
          <Link
            to="/"
            className="text-xs px-2.5 py-1.5 rounded-md bg-muted text-muted-foreground font-medium hover:bg-muted/80 transition-colors"
          >
            后台
          </Link>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          className="text-muted-foreground hover:bg-muted"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      <div className="px-4 pt-5 space-y-5">
        {!isInstalled && !dismissInstallHint && (
          <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-start gap-3 shadow-sm relative overflow-hidden">
            <div className="shrink-0 mt-0.5 bg-blue-100 dark:bg-blue-900/50 p-1.5 rounded-full">
              {isIOS ? <Share2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
            </div>
            <div className="flex-1 text-xs leading-relaxed">
              <div className="font-bold text-sm mb-1 text-blue-900 dark:text-blue-100">把司机端装到主屏幕</div>
              <div className="opacity-90">
                {isIOS ? (
                  <span>Safari 底部分享按钮 → 添加到主屏幕，图标跟 App 一样。</span>
                ) : canInstall ? (
                  <span>装上后从桌面图标直接打开，全屏无浏览器栏。</span>
                ) : (
                  <span>Chrome 右上角菜单 → 安装应用（或"添加到主屏幕"）。</span>
                )}
              </div>
            </div>
            {canInstall && !isIOS && (
              <Button
                size="sm"
                className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm"
                onClick={async () => {
                  await promptInstall();
                }}
              >
                安装
              </Button>
            )}
            <button
              className="absolute top-2 right-2 p-1.5 text-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
              aria-label="关闭"
              onClick={() => setDismissInstallHint(true)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
          <div className="p-4 flex items-center justify-between border-b bg-muted/20">
            <div>
              <h2 className="font-bold text-foreground flex items-center gap-2">
                <span>📅</span> 工作日程
              </h2>
            </div>
            <div className="flex items-center gap-2">
               <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 px-2.5 rounded-md border bg-background text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          </div>
          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">今日任务进度</div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-foreground">{doneCount}</span>
                <span className="text-lg font-bold text-muted-foreground">/ {total}</span>
              </div>
            </div>
            <div className={cn(
              "h-16 w-16 rounded-full flex items-center justify-center border-[5px]",
              total > 0 && doneCount === total 
                ? "border-green-500 bg-green-50 text-green-600 dark:bg-green-950/30" 
                : "border-primary/20 bg-primary/5 text-primary"
            )}>
              {total > 0 && doneCount === total ? <CheckCircle2 className="h-8 w-8" /> : <span className="text-xl font-bold">{total > 0 ? Math.round((doneCount/total)*100) : 0}<span className="text-xs">%</span></span>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-lg tracking-tight">执行路线</h3>
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
              当前可见 {Math.min(3, total)} 项
            </span>
          </div>

          {total === 0 && (
            <div className="bg-card border rounded-2xl p-10 flex flex-col items-center justify-center text-muted-foreground text-sm shadow-sm gap-3">
              <div className="bg-muted p-3 rounded-full">
                <CheckCircle2 className="h-8 w-8 opacity-50" />
              </div>
              <span className="font-medium">今天没有分配的步骤</span>
            </div>
          )}

          <div className="relative flex flex-col gap-3">
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
                              
                              {/* ETA 显示 */}
                              {(isCurrent || isNext) && etas && etas[s.id] && (
                                <div className={cn(
                                  "flex items-center gap-1.5 mt-3 w-fit font-semibold",
                                  isCurrent 
                                    ? "text-sm text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1.5 rounded-md border border-blue-100 dark:border-blue-900/50" 
                                    : "text-xs text-blue-600/80 dark:text-blue-400/80"
                                )}>
                                  <Clock className={cn("shrink-0", isCurrent ? "h-4 w-4" : "h-3.5 w-3.5")} />
                                  <span>ETA: {formatETATime(etas[s.id])} {isCurrent && <span className="opacity-80 font-medium">({formatETA(etas[s.id])})</span>}</span>
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
                              
                              {/* ETA 显示 */}
                              {(isCurrent || isNext) && etas && etas[s.id] && (
                                <div className={cn(
                                  "flex items-center gap-1.5 mt-3 w-fit font-semibold",
                                  isCurrent 
                                    ? "text-sm text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1.5 rounded-md border border-blue-100 dark:border-blue-900/50" 
                                    : "text-xs text-blue-600/80 dark:text-blue-400/80"
                                )}>
                                  <Clock className={cn("shrink-0", isCurrent ? "h-4 w-4" : "h-3.5 w-3.5")} />
                                  <span>ETA: {formatETATime(etas[s.id])} {isCurrent && <span className="opacity-80 font-medium">({formatETA(etas[s.id])})</span>}</span>
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
        </div>

        <button
          className="text-xs text-muted-foreground w-full text-center pt-2 font-medium hover:text-foreground transition-colors"
          onClick={() => refetch()}
        >
          ↻ 下拉或点击此处刷新
        </button>
      </div>
    </div>
  );
}
