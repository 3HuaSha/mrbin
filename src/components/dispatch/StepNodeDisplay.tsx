import React from "react";
import { CheckCircle2, MapPin, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { JobStep } from "@/types/dispatch";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface StepNodeDisplayProps {
  step: JobStep;
  onDelete: (id: string) => void;
  onClick?: () => void;
  linkedOrderLabel?: string;
  onOpenLinkDialog?: (stepId: string) => void;
}

export function StepNodeDisplay({
  step,
  onDelete,
  onClick,
  linkedOrderLabel,
  onOpenLinkDialog,
}: StepNodeDisplayProps) {
  const stepTypeLabels: Record<string, string> = {
    'pickup_bin': '取桶',
    'drop_bin': '放桶',
    'dump_waste': '倒垃圾',
    'load_material': '装料',
    'unload_material': '卸料',
  };
  const stepLabel = stepTypeLabels[step.step_type] || step.step_type;
  const isDone = step.status === "done";
  const isDumpWaste = (step.step_type as string) === 'dump_waste';

  return (
    <div 
      className={cn(
        "group relative rounded-lg border-l-4 shadow-sm p-2 transition-all duration-300 hover:shadow-lg hover:scale-105 hover:z-10 w-[150px] shrink-0",
        isDone 
          ? "border-l-green-600 bg-green-100" 
          : isDumpWaste
            ? "border-l-amber-500 bg-amber-50"
            : "border-l-gray-400 bg-card/80",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className={cn("text-[8px] w-fit", isDumpWaste && "border-amber-400 text-amber-700")}>
            {isDumpWaste ? '🗑️ 倒垃圾' : '手动步骤'}
          </Badge>
          {isDone && <CheckCircle2 className="h-3 w-3 text-green-600" />}
        </div>
        <div className="text-[11px] font-semibold">
          {stepLabel}
        </div>
        <div className="text-[9px] text-muted-foreground leading-snug break-words" title={step.location}>
          <MapPin className="h-2 w-2 inline mr-0.5" />
          {step.location}
        </div>
        {isDumpWaste && linkedOrderLabel && (
          <div className="text-[8px] text-amber-700 bg-amber-100 rounded px-1 py-0.5 truncate" title={linkedOrderLabel}>
            🔗 {linkedOrderLabel}
          </div>
        )}
        {isDumpWaste && !linkedOrderLabel && (
          <div className="text-[8px] text-muted-foreground/60 italic">
            未关联订单
          </div>
        )}
        {step.bin_number_reported && (
          <div className="text-[9px] text-primary">桶: {step.bin_number_reported}</div>
        )}
        {step.notes && (
          <div className="text-[8px] text-muted-foreground truncate">
            📝 {step.notes}
          </div>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button 
            className="absolute top-1 right-1 text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs min-w-[140px]">
          {onClick && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(); }}>
              查看详情
            </DropdownMenuItem>
          )}
          {isDumpWaste && onOpenLinkDialog && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenLinkDialog(step.id); }}>
              🔗 关联订单…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(step.id); }} className="text-destructive">
            删除步骤
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
