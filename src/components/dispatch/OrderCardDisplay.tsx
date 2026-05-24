import React from "react";
import { cn } from "@/lib/utils";
import { Order } from "@/types/dispatch";
import { typeMeta } from "@/lib/business";

interface OrderCardDisplayProps {
  order: Order;
  binNumber: string | null;
  ghost?: boolean;
}

export function OrderCardDisplay({ order, binNumber, ghost }: OrderCardDisplayProps) {
  const tm = typeMeta(order.type);

  // 桶类型中文映射
  const binTypeNames: Record<string, string> = {
    'garbage': '垃圾桶',
    'brick': '砖桶',
    'soil': '土桶',
    'cement': '水泥桶',
    'asphalt': '沥青桶',
    'sand': '沙子',
    'gravel': '码石',
    'topsoil': '表土',
    'fill': '填方',
    'stone': '石头',
  };
  const binTypeName = order.bin_type ? binTypeNames[order.bin_type] || order.bin_type : '—';

  return (
    <div className={cn(
      "p-1.5 rounded-md border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md cursor-grab active:cursor-grabbing select-none",
      ghost && "opacity-50 border-primary border-2",
      order.status === "done" && "bg-green-50 border-green-200"
    )}>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn("text-[10px] font-bold px-1 py-0.5 rounded leading-none", tm.className)}>
            {tm.label}
          </span>
          {order.bin_size && (
            <span className="text-[10px] bg-muted px-1 rounded font-semibold">
              {order.bin_size}yd
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{binTypeName}</span>
        </div>

        <div className="text-[10px] leading-snug line-clamp-1 font-medium" title={order.address}>
          {order.address}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-primary">
            {order.time_window === "custom" ? order.time_window_custom : order.time_window}
          </span>
          {binNumber && (
            <span className="text-[9px] font-bold text-green-700 bg-green-100 px-1 rounded">
              {binNumber}
            </span>
          )}
        </div>

        {order.customer_notes && (
          <div className="text-[9px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded italic truncate">
            📝 {order.customer_notes}
          </div>
        )}
      </div>
    </div>
  );
}
