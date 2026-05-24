import React, { useRef, useCallback, useState, useMemo, useEffect } from "react";
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
      const assignmentSteps = jobSteps.filter(s => s.assignment_id === a.id);
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
    timelineItems.filter(item => 
      item.type === 'assignment' 
        ? jobSteps.find(s => s.assignment_id === item.data.id && s.node_type === 'order')?.status === 'done'
        : item.data.status === 'done'
    ), [timelineItems, jobSteps]);

  const activeItems = useMemo(() => 
    timelineItems.filter(item => 
      item.type === 'assignment'
        ? jobSteps.find(s => s.assignment_id === item.data.id && s.node_type === 'order')?.status !== 'done'
        : item.data.status !== 'done'
    ), [timelineItems, jobSteps]);

  const doneScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (doneScrollRef.current && doneItems.length > 1) {
      doneScrollRef.current.scrollLeft = doneScrollRef.current.scrollWidth;
    }
  }, [doneItems.length]);

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
      {/* 顶部:司机和车辆信息 */}
      <div className="flex items-center justify-between mb-1 border-b pb-1">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs border-2 border-primary/20">
            {driver.name.slice(0, 1)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight">{driver.name}</span>
              {hasChanges && (
                <Badge variant="outline" className="text-[9px] h-4 bg-amber-100 text-amber-700 border-amber-300 animate-pulse">
                  未保存
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Select value={vehicle?.id || ""} onValueChange={onChangeVehicle}>
                <SelectTrigger className="h-6 w-[120px] text-[10px] bg-muted/50 border-none hover:bg-muted transition-colors">
                  <SelectValue placeholder="选择车辆" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => (
                    <SelectItem key={v.id} value={v.id} className="text-[10px]">
                      {v.name} ({v.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end mr-2">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">今日任务</span>
            <span className="text-base font-black leading-none">{timelineItems.length}</span>
          </div>
          {hasChanges && onSave && (
            <Button 
              size="sm" 
              onClick={onSave} 
              disabled={isSaving}
              className="h-8 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-200"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              保存同步
            </Button>
          )}
        </div>
      </div>

      {/* 任务时间轴 */}
      <div className="flex items-center gap-0 pb-1 pt-0.5 min-h-[50px]">
        {/* 已完成区域: 固定左侧，可横向滚动，自动滚到最右 */}
        {doneItems.length > 0 && (
          <div className="shrink-0 flex items-center border-r border-dashed border-muted-foreground/20 pr-2 mr-2">
            <div 
              ref={doneScrollRef}
              className="flex items-center gap-1.5 overflow-x-auto max-w-[180px] scroll-smooth"
            >
              {doneItems.map((item) => (
                <div key={item.type === 'assignment' ? `done-a:${item.data.id}` : `done-step:${item.data.id}`} className="shrink-0 opacity-40">
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
              ))}
            </div>
            <span className="ml-1.5 text-[9px] text-muted-foreground font-medium whitespace-nowrap">✓{doneItems.length}</span>
          </div>
        )}

        {/* 未完成区域: 可拖拽 */}
        <div className="flex-1 flex items-center gap-2 overflow-x-auto custom-scrollbar scroll-smooth">
          {/* 开头插入: 鼠标悬停行时显示 */}
          {activeItems.length > 0 && (
            <div className="shrink-0 self-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded-full border border-dashed border-muted-foreground/20 hover:border-primary hover:bg-primary/10 hover:text-primary bg-background opacity-0 group-hover:opacity-100 transition-all"
                    onClick={(e) => {
                      const firstActive = activeItems[0];
                      handleButtonClick(
                        firstActive?.stepNumber ?? 1, 
                        e, 
                        firstActive?.type === 'assignment' ? firstActive.data.order_id : undefined, 
                        firstActive?.type === 'assignment' ? firstActive.data.orders.type : undefined
                      );
                    }}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">在开头插入步骤</TooltipContent>
              </Tooltip>
            </div>
          )}

          <SortableContext
            items={activeItems.map(item => item.type === 'assignment' ? `a:${item.data.id}` : `step:${item.data.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            {activeItems.map((item, index) => {
              const nextItem = activeItems[index + 1];
              
              return (
                <div key={item.type === 'assignment' ? `a:${item.data.id}` : `step:${item.data.id}`} className="relative shrink-0 group/card">
                  <SortableOrderCard id={item.type === 'assignment' ? `a:${item.data.id}` : `step:${item.data.id}`}>
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

                  {/* 悬停卡片时显示插入按钮 */}
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
                    <TooltipContent side="bottom" className="text-[10px]">插入步骤</TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </SortableContext>

          {activeItems.length === 0 && doneItems.length === 0 && (
            <div className="flex-1 h-full flex items-center justify-center border-2 border-dashed border-muted/50 rounded-lg py-3 bg-muted/5 group-hover:bg-muted/10 transition-colors mx-2">
              <div className="text-center">
                <div className="text-[11px] font-semibold text-muted-foreground">暂无任务</div>
                <p className="text-[9px] text-muted-foreground/60 mt-1">拖拽订单到此行</p>
              </div>
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
