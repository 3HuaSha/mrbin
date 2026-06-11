import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, CheckCircle2, ArrowRight, LogOut, Truck, MapPin, Download, Share2, X, Clock } from "lucide-react";
import { STEP_TYPE_EMOJI, todayISO, typeMeta } from "@/lib/business";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/use-current-user";
import { usePWA } from "@/hooks/use-pwa";
import { formatETA, formatETATime } from "@/lib/eta-calculator";
import { driverBinTypeNames, driverOrderTypeLabels, driverStepTypeLabels, driverText, getDriverLanguage } from "@/lib/driver-language";

type SavedEtaRow = {
  step_id: string;
  eta_at: string;
  eta_min_at: string | null;
  eta_max_at: string | null;
  duration_seconds: number | null;
  status: string | null;
  computed_at: string | null;
};

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
  completed_at: string | null;
  orders?: {
    order_number: string;
    type: string;
    bin_size: string | null;
    bin_type: string | null;
    pallet_count?: number | null;
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
  const lang = getDriverLanguage(profile);
  const t = driverText[lang];

  // æœªç™»å½•æˆ–ä¸æ˜¯å¸æœº -> ç™»å½•é¡µ
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

  // è®¡ç®—æ¯ä¸ªæ­¥éª¤çš„é”å®šçŠ¶æ€ï¼šåªæœ‰å‰ä¸€ä¸ªæ­¥éª¤å®Œæˆæ‰èƒ½è§£é”
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

  const { data: etaRows = [] } = useQuery({
    queryKey: ["saved-driver-etas", driverId, date],
    enabled: !!driverId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("driver_eta_snapshots")
        .select("step_id,eta_at,eta_min_at,eta_max_at,duration_seconds,status,computed_at")
        .eq("driver_id", driverId)
        .eq("scheduled_date", date)
        .order("step_number");
      if (error) throw error;
      return (data ?? []) as SavedEtaRow[];
    },
  });

  const etaByStepId = useMemo(() => {
    const saved = new Map(etaRows.map((row) => [row.step_id, row]));
    const sorted = stepsWithLockStatus.slice().sort((a: StepRow, b: StepRow) => a.step_number - b.step_number);
    const snapshotComputedAt = etaRows
      .map((row) => row.computed_at ? new Date(row.computed_at).getTime() : 0)
      .reduce((latest, value) => Math.max(latest, value), 0);
    const activeSteps = sorted.filter((step: StepRow) => step.status !== "done");
    if (activeSteps.some((step: StepRow) => !saved.has(step.id))) return new Map<string, SavedEtaRow>();

    const adjusted = new Map(saved);

    sorted.forEach((target: StepRow, targetIndex: number) => {
      if (target.status === "done") return;
      const planned = saved.get(target.id);
      if (!planned) return;
      let usedCompletedAnchor = false;

      for (let i = targetIndex - 1; i >= 0; i -= 1) {
        const completedAt = sorted[i].completed_at;
        if (!completedAt || sorted[i].status !== "done") continue;
        if (snapshotComputedAt && new Date(completedAt).getTime() <= snapshotComputedAt) continue;

        let rollingTime = new Date(completedAt).getTime();
        for (let j = i + 1; j <= targetIndex; j += 1) {
          if (j > i + 1) rollingTime += serviceSecondsForStep(sorted[j - 1]) * 1000;
          const leg = saved.get(sorted[j].id);
          if (!leg) return;
          rollingTime += (leg.duration_seconds || 0) * 1000;
        }

        const etaAt = new Date(rollingTime).toISOString();
        adjusted.set(target.id, {
          ...planned,
          eta_at: etaAt,
          eta_min_at: new Date(rollingTime - 5 * 60_000).toISOString(),
          eta_max_at: new Date(rollingTime + 15 * 60_000).toISOString(),
        });
        usedCompletedAnchor = true;
        break;
      }

      if (usedCompletedAnchor) return;

    });

    return adjusted;
  }, [etaRows, stepsWithLockStatus]);

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
          <div className="text-base font-bold tracking-tight">{profile?.name ?? t.driverApp}</div>
          <div className="text-xs flex items-center gap-1.5 mt-0.5">
            <span className="relative flex h-2 w-2">
              {gpsActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
              <span className={cn("relative inline-flex rounded-full h-2 w-2", gpsActive ? "bg-green-500" : "bg-yellow-500")}></span>
            </span>
            <span className={cn("font-medium", gpsActive ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400")}>
              {gpsActive ? t.locationUpdating : t.waitingForLocation}
            </span>
          </div>
        </div>
        {hasRole("admin") || hasRole("dispatcher") ? (
          <Link
            to="/"
            className="text-xs px-2.5 py-1.5 rounded-md bg-muted text-muted-foreground font-medium hover:bg-muted/80 transition-colors"
          >
            {t.staff}
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
              <div className="font-bold text-sm mb-1 text-blue-900 dark:text-blue-100">{t.installApp}</div>
              <div className="opacity-90">
                {isIOS ? (
                  <span>{t.installIOS}</span>
                ) : canInstall ? (
                  <span>{t.installAndroid}</span>
                ) : (
                  <span>{t.installChrome}</span>
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
                {t.install}
              </Button>
            )}
            <button
              className="absolute top-2 right-2 p-1.5 text-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
              aria-label={t.close}
              onClick={() => setDismissInstallHint(true)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
          <div className="p-4 flex items-center justify-between bg-muted/20">
            <div>
              <h2 className="font-bold text-foreground flex items-center gap-2">
                {t.schedule}
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
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-lg tracking-tight">{t.route}</h3>
          </div>

          {total === 0 && (
            <div className="bg-card border rounded-2xl p-10 flex flex-col items-center justify-center text-muted-foreground text-sm shadow-sm gap-3">
              <div className="bg-muted p-3 rounded-full">
                <CheckCircle2 className="h-8 w-8 opacity-50" />
              </div>
              <span className="font-medium">{t.noStops}</span>
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
                const isNext = index === activeIndex + 1;

                // æ­¥éª¤ç±»åž‹æ ‡ç­¾
                const stepTypeLabels = driverStepTypeLabels[lang];
                const orderTypeLabels = driverOrderTypeLabels[lang];
                const stepLabel = isOrderNode
                  ? (s.orders!.type === 'material'
                      ? (stepTypeLabels[s.step_type] || s.step_type)
                      : (orderTypeLabels[s.orders!.type] || stepTypeLabels[s.step_type] || s.step_type))
                  : (stepTypeLabels[s.step_type] || s.step_type);

                const binTypeNames = driverBinTypeNames[lang];
                const binTypeName = isOrderNode && s.orders?.bin_type ? binTypeNames[s.orders.bin_type] || s.orders.bin_type : '';
                const stepEta = etaByStepId.get(s.id);

                return (
                  <div key={s.id} className="w-full flex flex-col items-center">
                    {/* è¿žæŽ¥çº¿ */}
                    {index > 0 && (
                      <div className="h-4 w-[2px] bg-border/50 my-1 rounded-full" />
                    )}

                    <div
                      className={cn(
                        "w-full rounded-2xl overflow-hidden transition-all duration-500",
                        isCurrent && "border-primary border-2 shadow-xl shadow-primary/10 bg-card translate-y-0 scale-100 opacity-100",
                        isDone && !isCurrent && "border border-border/50 bg-muted/30 scale-[0.96] opacity-60 blur-[0.5px]",
                        !isDone && !isCurrent && "border border-dashed border-border bg-card/80 scale-[0.98] opacity-80"
                      )}
                    >
                      <div className={cn(
                        "text-[11px] font-bold px-4 py-1.5 flex items-center gap-2",
                        isCurrent ? "bg-primary text-primary-foreground" :
                        isDone ? "bg-muted text-muted-foreground" :
                        "bg-muted/50 text-muted-foreground"
                      )}>
                        {isCurrent && <><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-primary-foreground"></span></span> {t.currentTask}</>}
                        {isDone && !isCurrent && `✓ ${t.completed}`}
                        {!isDone && !isCurrent && `⏳ ${t.upcoming}`}
                      </div>

                      <div className={cn("p-4 flex items-start gap-3", isDone && !isCurrent && "grayscale-[0.5]")}>
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
                                  <span className="leading-relaxed">{s.orders!.customer_notes}</span>
                                </div>
                              )}

                              {/* ETA æ˜¾ç¤º */}
                              {isPending && stepEta?.eta_at && (
                                <div className={cn(
                                  "flex items-center gap-1.5 mt-3 w-fit font-semibold",
                                  isCurrent
                                    ? "text-sm text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1.5 rounded-md border border-blue-100 dark:border-blue-900/50"
                                    : "text-xs text-blue-600/80 dark:text-blue-400/80"
                                )}>
                                  <Clock className={cn("shrink-0", isCurrent ? "h-4 w-4" : "h-3.5 w-3.5")} />
                                  <span>
                                    {t.eta}: {formatETATime(stepEta.eta_at)}
                                    <span className="opacity-80 font-medium"> / {t.finish} {formatStepFinishTime(stepEta.eta_at, s)}</span>
                                    {stepEta.eta_min_at && stepEta.eta_max_at && (
                                      <span className="opacity-80 font-medium"> Â· {formatETATime(stepEta.eta_min_at)}-{formatETATime(stepEta.eta_max_at)}</span>
                                    )}
                                    {isCurrent && <span className="opacity-80 font-medium"> ({formatETA(stepEta.eta_at)})</span>}
                                  </span>
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                <Badge variant="outline" className="text-[10px] shadow-sm">{t.manualStep}</Badge>
                              </div>
                              <div className="text-base font-bold tracking-tight text-foreground/90">
                                {STEP_TYPE_EMOJI[s.step_type] || ""} {stepLabel}
                              </div>
                              <div className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed flex items-start gap-1">
                                <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>{s.location}</span>
                              </div>
                              {s.notes && isPending && !isLocked && (
                                <div className="mt-3 text-xs bg-muted rounded-md px-3 py-2 border flex gap-2">
                                  <span className="leading-relaxed">{s.notes}</span>
                                </div>
                              )}

                              {/* ETA æ˜¾ç¤º */}
                              {isPending && stepEta?.eta_at && (
                                <div className={cn(
                                  "flex items-center gap-1.5 mt-3 w-fit font-semibold",
                                  isCurrent
                                    ? "text-sm text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1.5 rounded-md border border-blue-100 dark:border-blue-900/50"
                                    : "text-xs text-blue-600/80 dark:text-blue-400/80"
                                )}>
                                  <Clock className={cn("shrink-0", isCurrent ? "h-4 w-4" : "h-3.5 w-3.5")} />
                                  <span>
                                    {t.eta}: {formatETATime(stepEta.eta_at)}
                                    <span className="opacity-80 font-medium"> / {t.finish} {formatStepFinishTime(stepEta.eta_at, s)}</span>
                                    {stepEta.eta_min_at && stepEta.eta_max_at && (
                                      <span className="opacity-80 font-medium"> Â· {formatETATime(stepEta.eta_min_at)}-{formatETATime(stepEta.eta_max_at)}</span>
                                    )}
                                    {isCurrent && <span className="opacity-80 font-medium"> ({formatETA(stepEta.eta_at)})</span>}
                                  </span>
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
                            {t.startTask} <ArrowRight className="inline h-5 w-5 ml-1.5" />
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
          ↻ {t.refresh}
        </button>
      </div>
    </div>
  );
}

function serviceSecondsForStep(step: StepRow) {
  const pallets = Number(step.orders?.pallet_count || 0);
  if (pallets > 0) return (10 + pallets * 2) * 60;
  return 15 * 60;
}

function formatStepFinishTime(etaIso: string, step: StepRow) {
  return formatETATime(new Date(new Date(etaIso).getTime() + serviceSecondsForStep(step) * 1000).toISOString());
}
