import React from "react";
import { cn } from "@/lib/utils";
import { Order } from "@/types/dispatch";

interface StageProps {
  active: boolean;
  done: boolean;
  label: string;
  time?: string | null;
  detail?: React.ReactNode;
  fmtTime: (iso: string | null | undefined) => string | null;
}

const Stage = ({ active, done, label, time, detail, fmtTime }: StageProps) => (
  <div className="flex-1 relative">
    <div className={cn(
      "flex items-center justify-center w-8 h-8 rounded-full mx-auto text-xs font-bold",
      done ? "bg-green-500 text-white" : active ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"
    )}>
      {done ? "✓" : active ? "•" : "○"}
    </div>
    <div className="text-center mt-1">
      <div className={cn("text-xs font-semibold", done ? "text-green-700" : active ? "text-blue-700" : "text-gray-400")}>
        {label}
      </div>
      {time && <div className="text-[10px] text-muted-foreground mt-0.5">{fmtTime(time)}</div>}
      {detail && <div className="text-[10px] text-muted-foreground mt-0.5">{detail}</div>}
    </div>
  </div>
);

interface LifecycleTimelineProps {
  order: Order;
  linkedOrder: { id: string; type: string; status: string; service_date: string } | null;
  selfAssignments: any[];
  linkedAssignments: any[];
  orphanSteps?: any[];
}

export function LifecycleTimeline({ 
  order, 
  linkedOrder, 
  selfAssignments, 
  linkedAssignments, 
  orphanSteps = [] 
}: LifecycleTimelineProps) {
  // 收集所有相关 job_steps
  const allSteps: any[] = [];
  const selfSteps: any[] = [];
  const linkedSteps: any[] = [];
  
  selfAssignments.forEach(a => (a.job_steps || []).forEach((s: any) => { 
    const step = { ...s, _assignment: a }; 
    allSteps.push(step); 
    selfSteps.push(step); 
  }));
  
  linkedAssignments.forEach(a => (a.job_steps || []).forEach((s: any) => { 
    const step = { ...s, _assignment: a }; 
    allSteps.push(step); 
    linkedSteps.push(step); 
  }));
  
  // 包含通过 order_id 直接关联的手动步骤（如 dump_waste, load_material）
  orphanSteps.forEach((s: any) => { allSteps.push(s); });

  const fmtTime = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  // 砂石料订单: 装料 → 送料
  if (order.type === "material") {
    const loadStep = allSteps.find(s =>
      s.step_type === "load_material" && s.status === "done"
    );
    const unloadStep = allSteps.find(s =>
      s.step_type === "unload_material" && s.status === "done"
    );
    const selfIsDone = order.status === "done";

    const loadDone = !!loadStep;
    const unloadDone = !!unloadStep || selfIsDone;

    return (
      <div className="bg-white border rounded-lg p-4 mb-3">
        <div className="text-sm font-semibold mb-3">🔄 订单生命周期</div>
        <div className="flex items-start gap-1 relative">
          <div className="absolute top-4 left-8 right-8 h-0.5 bg-gray-200" style={{ zIndex: 0 }} />
          <div
            className="absolute top-4 left-8 h-0.5 bg-green-500 transition-all"
            style={{
              zIndex: 0,
              width: `${(loadDone ? 50 : 0) + (unloadDone ? 50 : 0)}%`,
              maxWidth: "calc(100% - 64px)"
            }}
          />
          <div className="relative flex w-full gap-1" style={{ zIndex: 1 }}>
            <Stage
              active={false}
              done={loadDone}
              label="装料"
              time={loadStep?.completed_at}
              fmtTime={fmtTime}
              detail={(loadStep?._assignment?.profiles?.name || loadStep?.photo_url) ? (
                <div className="space-y-0.5">
                  {loadStep?._assignment?.profiles?.name && <div>司机: {loadStep._assignment.profiles.name}</div>}
                  {loadStep?.photo_url && (
                    <a href={loadStep.photo_url} target="_blank" rel="noreferrer" className="text-primary underline">照片</a>
                  )}
                </div>
              ) : undefined}
            />
            <Stage
              active={false}
              done={unloadDone}
              label="送料"
              time={unloadStep?.completed_at}
              fmtTime={fmtTime}
              detail={(unloadStep?._assignment?.profiles?.name || unloadStep?.photo_url) ? (
                <div className="space-y-0.5">
                  {unloadStep?._assignment?.profiles?.name && <div>司机: {unloadStep._assignment.profiles.name}</div>}
                  {unloadStep?.photo_url && (
                    <a href={unloadStep.photo_url} target="_blank" rel="noreferrer" className="text-primary underline">照片</a>
                  )}
                </div>
              ) : undefined}
            />
          </div>
        </div>
      </div>
    );
  }

  // 桶订单: 送达 → 回收 → 称重
  // 提取关键节点
  const deliveredStep = selfSteps.find(s =>
    (s.step_type === "delivery" || s.step_type === "customer_delivery") &&
    s.status === "done"
  ) || (order.type === "swap" ? selfSteps.find(s =>
    s.step_type === "swap" && s.status === "done"
  ) : undefined);
  
  const pickedUpStep = allSteps.find(s =>
    (s.step_type === "pickup" || s.step_type === "customer_pickup") &&
    s.status === "done"
  );
  
  const swapEvidenceSource = order.type === "swap" ? linkedSteps : allSteps;
  const swapPickupEvidence = swapEvidenceSource.find(s =>
    (s.step_type === "customer_delivery" || s.step_type === "swap") &&
    s.status === "done" &&
    (s.pickup_photo_url || s.old_bin_number_reported)
  );
  
  const dumpStep = order.type === "swap" ? undefined : allSteps.find(s => 
    (s.step_type === "dump_site" || s.step_type === "dump_waste") && s.status === "done"
  );

  const deliveredAt = deliveredStep?.completed_at;
  const pickedUpAt = pickedUpStep?.completed_at ?? swapPickupEvidence?.completed_at;
  const dumpedAt = dumpStep?.completed_at;

  const deliveredPhotoUrl = deliveredStep?.photo_url;
  const pickedUpPhotoUrl = pickedUpStep?.photo_url ?? swapPickupEvidence?.pickup_photo_url;

  const linkedIsDoneDelivery = !!linkedOrder && linkedOrder.type === "delivery" && 
    (linkedOrder.status === "done" || linkedOrder.status === "in_progress");
  const selfIsDoneDelivery = order.type === "delivery" && order.status === "done";
  
  const stage1Done = !!deliveredAt || selfIsDoneDelivery || linkedIsDoneDelivery;
  const stage3Done = !!pickedUpAt;
  const stage4Done = !!dumpedAt;

  const showDelivered = order.type !== "pickup" || linkedIsDoneDelivery;

  return (
    <div className="bg-white border rounded-lg p-4 mb-3">
      <div className="text-sm font-semibold mb-3">🔄 订单生命周期</div>
      <div className="flex items-start gap-1 relative">
        {/* 连接线 */}
        <div className="absolute top-4 left-8 right-8 h-0.5 bg-gray-200" style={{ zIndex: 0 }} />
        <div
          className="absolute top-4 left-8 h-0.5 bg-green-500 transition-all"
          style={{
            zIndex: 0,
            width: `${(stage1Done ? 1 : 0) * 50 + (stage3Done ? 1 : 0) * 25 + (stage4Done ? 1 : 0) * 25}%`,
            maxWidth: "calc(100% - 64px)"
          }}
        />

        <div className="relative flex w-full gap-1" style={{ zIndex: 1 }}>
          {showDelivered && (
            <Stage
              active={false}
              done={stage1Done}
              label="送达"
              time={deliveredAt}
              fmtTime={fmtTime}
              detail={(deliveredStep?._assignment?.profiles?.name || deliveredPhotoUrl) ? (
                <div className="space-y-0.5">
                  {deliveredStep?._assignment?.profiles?.name && <div>司机: {deliveredStep._assignment.profiles.name}</div>}
                  {deliveredPhotoUrl && (
                    <a href={deliveredPhotoUrl} target="_blank" rel="noreferrer" className="text-primary underline">照片</a>
                  )}
                </div>
              ) : undefined}
            />
          )}
          <Stage
            active={false}
            done={stage3Done}
            label="回收"
            time={pickedUpAt}
            fmtTime={fmtTime}
            detail={(pickedUpStep?._assignment?.profiles?.name || swapPickupEvidence?._assignment?.profiles?.name || pickedUpPhotoUrl) ? (
              <div className="space-y-0.5">
                {(pickedUpStep?._assignment?.profiles?.name || swapPickupEvidence?._assignment?.profiles?.name) && (
                  <div>司机: {pickedUpStep?._assignment?.profiles?.name ?? swapPickupEvidence?._assignment?.profiles?.name}</div>
                )}
                {pickedUpPhotoUrl && (
                  <a href={pickedUpPhotoUrl} target="_blank" rel="noreferrer" className="text-primary underline">照片</a>
                )}
              </div>
            ) : undefined}
          />
          <Stage
            active={false}
            done={stage4Done}
            label="称重"
            time={dumpedAt}
            fmtTime={fmtTime}
            detail={dumpStep ? (
              <div className="space-y-0.5">
                {dumpStep.weight_kg != null && <div>{dumpStep.weight_kg} kg</div>}
                {dumpStep.dump_site && <div className="truncate max-w-[80px] mx-auto">{dumpStep.dump_site}</div>}
                {dumpStep.photo_url && (
                  <a href={dumpStep.photo_url} target="_blank" rel="noreferrer" className="text-primary underline">垃圾照片</a>
                )}
                {dumpStep.weigh_ticket_url && (
                  <a href={dumpStep.weigh_ticket_url} target="_blank" rel="noreferrer" className="text-primary underline">垃圾单</a>
                )}
              </div>
            ) : undefined}
          />
        </div>
      </div>
    </div>
  );
}
