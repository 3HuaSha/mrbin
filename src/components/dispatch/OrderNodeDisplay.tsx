import { CheckCircle2, AlertTriangle, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Assignment, Vehicle, JobStep } from "@/types/dispatch";
import { typeMeta, vehicleCanCarry } from "@/lib/business";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrderNodeDisplayProps {
  assignment: Assignment;
  vehicle: Vehicle | undefined;
  onCancel: (id: string) => void;
  jobStep?: JobStep;
  onClick?: () => void;
}

export function OrderNodeDisplay({
  assignment,
  vehicle,
  onCancel,
  jobStep,
  onClick,
}: OrderNodeDisplayProps) {
  const order = assignment.orders;
  const tm = typeMeta(order.type);
  const conflict = vehicle ? !vehicleCanCarry(vehicle.type as any, order.bin_size) : false;
  const isDone = jobStep?.status === "done";
  const isBrickOrder = order.business_type === "brick" || Number(order.pallet_count || 0) > 0 || order.bin_type === "brick";
  
  // 桶类型中文映射
  const binTypeNames: Record<string, string> = {
    'garbage': '垃圾桶',
    'brick': '砖桶',
    'soil': '土桶',
    'cement': '水泥桶',
    'asphalt': '沥青桶'
  };
  const binTypeName = order.bin_type ? binTypeNames[order.bin_type] || order.bin_type : '';

  const timeLabel = (o: any) => {
    return o.time_window === "custom" ? (o.time_window_custom || "自定义") : o.time_window;
  };

  return (
    <div 
      className={cn(
        "group relative rounded-lg border-l-4 shadow-sm p-3 transition-all duration-300 hover:shadow-lg hover:scale-105 hover:z-10 w-[200px] shrink-0",
        isDone 
          ? "border-l-green-600 bg-green-100" 
          : "border-l-blue-500 bg-card",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold leading-tight">
            {tm.emoji} {tm.label} {order.bin_size ? `${order.bin_size}yd` : ""} {binTypeName}
          </div>
          {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
        </div>
        <div className="text-[10px] text-muted-foreground leading-snug truncate" title={order.address}>
          {order.address}
        </div>
        <div className="text-[10px] text-primary font-medium">{timeLabel(order)}</div>
        {(order.pallet_count || order.priority) && (
          <div className="flex items-center gap-1 text-[9px] font-semibold">
            {order.pallet_count && (
              <span className="rounded bg-orange-100 px-1 text-orange-800">{order.pallet_count} PLT</span>
            )}
            {order.priority && order.bin_type === "brick" && (
              <span className="rounded bg-blue-100 px-1 text-blue-800">{order.priority}</span>
            )}
            {isBrickOrder && order.can_split === false && (
              <span className="rounded bg-red-100 px-1 text-red-700">No split</span>
            )}
          </div>
        )}
        {jobStep?.bin_number_reported && (
          <div className="text-[9px] text-primary">桶号: {jobStep.bin_number_reported}</div>
        )}
        {order.customer_notes && (
          <div className="text-[9px] text-status-progress truncate">
            📝 {order.customer_notes}
          </div>
        )}
        {conflict && vehicle && (
          <div className="text-[9px] text-destructive font-bold flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5" /> {vehicle.type} 不支持 {order.bin_size}yd 桶
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
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); alert(`订单号:${order.order_number}\n客户:${order.customer_name}\n地址:${order.address}`); }}>
            订单信息
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCancel(assignment.id); }} className="text-destructive">
            取消分配
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
