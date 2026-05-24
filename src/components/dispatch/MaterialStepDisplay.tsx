import { useState } from "react";
import { CheckCircle2, MoreVertical, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Assignment, Vehicle, JobStep } from "@/types/dispatch";
import { STEP_TYPE_LABEL, STEP_TYPE_EMOJI } from "@/lib/business";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface MaterialStepDisplayProps {
  step: JobStep;
  assignment: Assignment;
  vehicle: Vehicle | undefined;
  onCancel: (id: string) => void;
  onClick?: () => void;
  onDateChange?: (stepId: string, newDate: string) => void;
}

const MATERIAL_TYPE_NAMES: Record<string, string> = {
  sand: "沙子",
  gravel: "码石",
  topsoil: "表土",
  fill: "填方",
  stone: "石头",
};

export function MaterialStepDisplay({
  step,
  assignment,
  vehicle,
  onCancel,
  onClick,
  onDateChange,
}: MaterialStepDisplayProps) {
  const [dateOpen, setDateOpen] = useState(false);
  const [newDate, setNewDate] = useState(step.scheduled_date || "");

  const order = assignment.orders;
  const isDone = step.status === "done";
  const isLoad = (step.step_type as string) === "load_material";
  const emoji = STEP_TYPE_EMOJI[step.step_type || ""] || "🟡";
  const label = STEP_TYPE_LABEL[step.step_type || ""] || (isLoad ? "装料" : "送料");
  const materialName = order.bin_type ? (MATERIAL_TYPE_NAMES[order.bin_type] || order.bin_type) : "";

  return (
    <div
      className={cn(
        "group relative rounded-lg border-l-4 shadow-sm p-2 transition-all duration-300 hover:shadow-lg hover:scale-105 hover:z-10 w-[160px] shrink-0",
        isDone
          ? "border-l-green-600 bg-green-100"
          : isLoad
            ? "border-l-yellow-500 bg-yellow-50"
            : "border-l-amber-500 bg-amber-50",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold leading-tight">
            {emoji} {label} {materialName && `· ${materialName}`}
          </div>
          {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
        </div>
        <div className="text-[10px] text-muted-foreground leading-snug truncate" title={step.location || ""}>
          {step.location || order.address}
        </div>
        <div className="text-[10px] text-muted-foreground font-mono">
          {order.order_number}
        </div>
        {order.customer_notes && (
          <div className="text-[9px] text-status-progress truncate">
            📝 {order.customer_notes}
          </div>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="absolute top-1.5 right-1.5 text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs min-w-[120px]">
          {onClick && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(); }}>
              查看详情
            </DropdownMenuItem>
          )}
          {onDateChange && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setNewDate(step.scheduled_date || "");
                setDateOpen(true);
              }}
            >
              <CalendarDays className="h-3 w-3 mr-1" />
              改日期
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onCancel(assignment.id); }}
            className="text-destructive"
          >
            取消分配
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 改日期弹窗 */}
      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger asChild>
          <span />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-2">
            <div className="text-xs font-bold">修改 {label} 日期</div>
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  if (onDateChange && newDate) {
                    onDateChange(step.id, newDate);
                  }
                  setDateOpen(false);
                }}
              >
                确认
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setDateOpen(false)}
              >
                取消
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
