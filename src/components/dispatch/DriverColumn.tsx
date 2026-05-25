import React, { useRef, useCallback, useState, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { 
  Plus, 
  MapPin, 
  CheckCircle2, 
  AlertTriangle, 
  Save, 
  Loader2, 
  Trash2,
  ChevronRight,
  MoreVertical
} from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  Profile, 
  Vehicle, 
  Assignment, 
  JobStep, 
  CommonLocation, 
  Bin 
} from "@/types/dispatch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { OrderNodeDisplay } from "./OrderNodeDisplay";
import { StepNodeDisplay } from "./StepNodeDisplay";
import { SortableOrderCard } from "./SortableOrderCard";
import { InsertStepButton } from "./InsertStepButton";

interface DriverColumnProps {
  driver: Profile;
  vehicle: Vehicle | undefined;
  vehicles: Vehicle[];
  onChangeVehicle: (id: string) => void;
  assignments: Assignment[];
  allAssignments: Assignment[];
  jobSteps: JobStep[];
  commonLocations: CommonLocation[];
  bins: Bin[];
  swapToPickup: Record<string, string>;
  onCancel: (id: string) => void;
  hasChanges?: boolean;
  onSave?: () => void;
  isSaving?: boolean;
  onInsertStep: (params: { 
    driverId: string; 
    position: number; 
    location: string; 
    stepType: string; 
    binId?: string; 
    notes?: string; 
    orderId?: string 
  }) => void;
  onDeleteStep: (stepId: string) => void;
  onOpenLinkDialog: (stepId: string) => void;
  insertStepAt: { 
    driverId: string; 
    position: number; 
    adjacentOrderId?: string; 
    adjacentOrderType?: string 
  } | null;
  setInsertStepAt: (value: { 
    driverId: string; 
    position: number; 
    adjacentOrderId?: string; 
    adjacentOrderType?: string 
  } | null) => void;
  onViewStep: (step: JobStep) => void;
  onDateChange?: (stepId: string, newDate: string) => void;
}

export function DriverColumn({
  driver,
  vehicle,
  vehicles,
  onChangeVehicle,
  assignments,
  allAssignments,
  jobSteps,
  commonLocations,
  bins,
  swapToPickup,
  onCancel,
  hasChanges,
  onSave,
  isSaving,
  onInsertStep,
  onDeleteStep,
  onOpenLinkDialog,
  insertStepAt,
  setInsertStepAt,
  onViewStep,
  onDateChange,
}: DriverColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: driver.id });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  
  const combinedRef = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    scrollRef.current = node;
  }, [setNodeRef]);

  const [buttonPosition, setButtonPosition] = useState<{ x: number; y: number } | null>(null);
  
  const handleButtonClick = (position: number, event: React.MouseEvent<HTMLButtonElement>, adjacentOrderId?: string, adjacentOrderType?: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setButtonPosition({ x: rect.left, y: rect.bottom });
    setInsertStepAt({ driverId: driver.id, position, adjacentOrderId, adjacentOrderType });
  };

  // 合并 assignments 和手动步骤 (jobSteps with node_type='step')，并按 sequence/step_number 排序
  const timelineItems = useMemo(() => {
    type TimelineItem = 
      | { type: 'assignment'; data: Assignment; stepNumber: number }
      | { type: 'step'; data: JobStep; stepNumber: number };

    const items: TimelineItem[] = [];

    assignments.forEach(a => {
      const assignmentSteps = jobSteps.filter(s => s.assignment_id === a.id && s.node_type === 'order');
      const stepNumber = assignmentSteps.length > 0 ? assignmentSteps[0].step_number : a.sequence;
      items.push({ type: 'assignment', data: a, stepNumber });
    });

    jobSteps.filter(s => s.node_type === 'step').forEach(s => {
      items.push({ type: 'step', data: s, stepNumber: s.step_number });
    });

    return items.sort((a, b) => a.stepNumber - b.stepNumber);
  }, [assignments, jobSteps]);

  // 分离已完成和未完成的任务
  const doneItems = useMemo(() => 
    timelineItems.filter(item => {
      if (item.type === 'assignment') return jobSteps.find(s => s.assignment_id === item.data.id && s.node_type === 'order')?.status === 'done';
      return item.data.status === 'done';
    }), [timelineItems, jobSteps]);

  const activeItems = useMemo(() => 
    timelineItems.filter(item => {
      if (item.type === 'assignment') return jobSteps.find(s => s.assignment_id === item.data.id && s.node_type === 'order')?.status !== 'done';
      return item.data.status !== 'done';
    }), [timelineItems, jobSteps]);

  const [doneExpanded, setDoneExpanded] = useState(false);

  const isInserting = insertStepAt?.driverId === driver.id;

  return (
    <div 
      ref={combinedRef}
      className={cn(
        "group relative bg-card border rounded-lg p-2 transition-all duration-300",
        isOver && "ring-2 ring-primary ring-inset bg-primary/5 shadow-inner scale-[1.01] z-20",
        hasChanges && "border-amber-400 bg-amber-50/30 shadow-amber-100",
      )}
    >
      {/* 顶部:司机和车辆信息 - 单行紧凑 */}
      <div className="flex items-center gap-2 mb-1 border-b pb-1">
        <div className="h-6 w-6 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-[10px] border border-primary/20">
          {driver.name.slice(0, 1)}
        </div>
        <span className="font-bold text-xs whitespace-nowrap">{driver.name}</span>
        <Select value={vehicle?.id || ""} onValueChange={onChangeVehicle}>
          <SelectTrigger className="h-5 w-auto max-w-[160px] text-[10px] px-1.5 bg-muted/50 border-none hover:bg-muted transition-colors">
            <SelectValue placeholder="选择车辆" />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map(v => (
              <SelectItem key={v.id} value={v.id} className="text-[10px]">
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[10px] text-muted-foreground ml-auto">{timelineItems.length}任务</span>
        {hasChanges && (
          <Badge variant="outline" className="text-[9px] h-4 px-1 bg-amber-100 text-amber-700 border-amber-300 animate-pulse">
            未保存
          </Badge>
        )}
        {hasChanges && onSave && (
          <Button 
            size="sm" 
            onClick={onSave} 
            disabled={isSaving}
            className="h-6 px-2 text-[10px] gap-1 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            保存
          </Button>
        )}
      </div>

      {/* 任务时间轴 */}
      <div className="flex items-center gap-0 pb-1 pt-0.5 min-h-[70px]">
        {/* 已完成区域: 默认只显示最近一个，点击展开全部 */}
        {doneItems.length > 0 && (
          <div className="shrink-0 flex items-center border-r border-muted-foreground/15 pr-2 mr-2">
            {!doneExpanded ? (
              <>
                <div className="shrink-0 opacity-40">
                  {(() => {
                    const lastDone = doneItems[doneItems.length - 1];
                    return lastDone.type === 'assignment' ? (
                      <OrderNodeDisplay 
                        assignment={lastDone.data}
                        vehicle={vehicle}
                        onCancel={onCancel}
                        jobStep={jobSteps.find(s => s.assignment_id === lastDone.data.id && s.node_type === 'order')}
                        onClick={() => onViewStep(jobSteps.find(s => s.assignment_id === lastDone.data.id && s.node_type === 'order')!)}
                      />
                    ) : (
                      <StepNodeDisplay 
                        step={lastDone.data}
                        onDelete={onDeleteStep}
                        onClick={() => onViewStep(lastDone.data)}
                        linkedOrderLabel={lastDone.data.order_id ? (allAssignments.find(a => a.order_id === lastDone.data.order_id)?.orders.order_number || '未知订单') : undefined}
                        onOpenLinkDialog={onOpenLinkDialog}
                      />
                    );
                  })()}
                </div>
                {doneItems.length > 1 && (
                  <button
                    onClick={() => setDoneExpanded(true)}
                    className="ml-1 text-[9px] text-muted-foreground hover:text-primary font-medium whitespace-nowrap transition-colors"
                    title="展开全部已完成任务"
                  >
                    +{doneItems.length - 1}
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                {doneItems.map((item) => {
                  const doneKey = item.type === 'assignment' ? `done-a:${item.data.id}` : `done-step:${item.data.id}`;
                  return (
                  <div key={doneKey} className="shrink-0 opacity-40">
                    {item.type === 'assignment' ? (
                      <OrderNodeDisplay 
                        assignment={item.data}
                        vehicle={vehicle}
                        onCancel={onCancel}
                        jobStep={jobSteps.find(s => s.assignment_id === item.data.id && s.node_type === 'order')}
                        onClick={() => onViewStep(jobSteps.find(s => s.assignment_id === item.data.id && s.node_type === 'order')!)}
                      />
                    ) : (
                      <StepNodeDisplay 
                        step={item.data}
                        onDelete={onDeleteStep}
                        onClick={() => onViewStep(item.data)}
                        linkedOrderLabel={item.data.order_id ? (allAssignments.find(a => a.order_id === item.data.order_id)?.orders.order_number || '未知订单') : undefined}
                        onOpenLinkDialog={onOpenLinkDialog}
                      />
                    )}
                  </div>
                  );
                })}
                <button
                  onClick={() => setDoneExpanded(false)}
                  className="ml-1 text-[9px] text-muted-foreground hover:text-primary font-medium whitespace-nowrap transition-colors"
                  title="收起已完成任务"
                >
                  收起
                </button>
              </div>
            )}
          </div>
        )}

        {/* 未完成区域: 可拖拽 */}
        <div className="flex-1 flex items-center gap-2 overflow-x-auto custom-scrollbar scroll-smooth">
          <SortableContext
            items={activeItems.map(item => item.type === 'assignment' ? `a:${item.data.id}` : `step:${item.data.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            {activeItems.map((item, index) => {
              const prevItem = activeItems[index - 1];
              const nextItem = activeItems[index + 1];
              const itemKey = item.type === 'assignment' ? `a:${item.data.id}` : `step:${item.data.id}`;
              
              return (
                <div key={itemKey} className="relative shrink-0 group/card">
                  <SortableOrderCard id={itemKey}>
                    {item.type === 'assignment' ? (
                      <OrderNodeDisplay 
                        assignment={item.data}
                        vehicle={vehicle}
                        onCancel={onCancel}
                        jobStep={jobSteps.find(s => s.assignment_id === item.data.id && s.node_type === 'order')}
                        onClick={() => onViewStep(jobSteps.find(s => s.assignment_id === item.data.id && s.node_type === 'order')!)}
                      />
                    ) : (
                      <StepNodeDisplay 
                        step={item.data}
                        onDelete={onDeleteStep}
                        onClick={() => onViewStep(item.data)}
                        linkedOrderLabel={item.data.order_id ? (allAssignments.find(a => a.order_id === item.data.order_id)?.orders.order_number || '未知订单') : undefined}
                        onOpenLinkDialog={onOpenLinkDialog}
                      />
                    )}
                  </SortableOrderCard>

                  {/* 左侧插入按钮 */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute -left-2.5 top-1/2 -translate-y-1/2 z-10 h-5 w-5 rounded-full border border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/10 hover:text-primary bg-background shadow-sm opacity-0 group-hover/card:opacity-100 transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          let adjId: string | undefined;
                          let adjType: string | undefined;
                          if (item.type === 'assignment') {
                            adjId = item.data.order_id;
                            adjType = item.data.orders.type;
                          } else if (prevItem?.type === 'assignment') {
                            adjId = prevItem.data.order_id;
                            adjType = prevItem.data.orders.type;
                          }
                          handleButtonClick(item.stepNumber, e, adjId, adjType);
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-[10px]">在前面插入</TooltipContent>
                  </Tooltip>

                  {/* 右侧插入按钮 */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 h-5 w-5 rounded-full border border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/10 hover:text-primary bg-background shadow-sm opacity-0 group-hover/card:opacity-100 transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          let adjId: string | undefined;
                          let adjType: string | undefined;
                          if (item.type === 'assignment') {
                            adjId = item.data.order_id;
                            adjType = item.data.orders.type;
                          } else if (nextItem?.type === 'assignment') {
                            adjId = nextItem.data.order_id;
                            adjType = nextItem.data.orders.type;
                          }
                          handleButtonClick(item.stepNumber + 1, e, adjId, adjType);
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-[10px]">在后面插入</TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </SortableContext>

          {activeItems.length === 0 && (
            <div className="shrink-0 flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/10 hover:text-primary bg-background"
                    onClick={(e) => handleButtonClick(1, e)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">添加步骤</TooltipContent>
              </Tooltip>
              {doneItems.length === 0 && (
                <span className="text-[10px] text-muted-foreground/60">拖拽订单到此行</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 插入步骤悬浮窗 */}
      {isInserting && buttonPosition && (
        <div 
          className="fixed z-[100] animate-in fade-in zoom-in duration-200"
          style={{ 
            left: `${buttonPosition.x}px`, 
            top: `${buttonPosition.y + 8}px` 
          }}
        >
          <InsertStepButton 
            driverId={driver.id}
            position={insertStepAt!.position}
            isActive={true}
            onClose={() => setInsertStepAt(null)}
            onInsert={onInsertStep}
            commonLocations={commonLocations}
            bins={bins}
            adjacentOrderId={insertStepAt!.adjacentOrderId}
            adjacentOrderType={insertStepAt!.adjacentOrderType}
          />
        </div>
      )}
    </div>
  );
}
