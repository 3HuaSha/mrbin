import React from "react";
import { 
  ChevronDown, 
  ChevronRight, 
  Pencil, 
  X 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ORDER_STATUS_CLASS, 
  ORDER_STATUS_LABEL 
} from "@/lib/business";
import { Order } from "@/types/dispatch";
import { BusinessType } from "@/lib/business";
import { OrderDetailRow } from "./OrderDetailRow";

interface FragmentRowProps {
  key?: React.Key;
  order: Order;
  childOrder?: Order;
  businessType: BusinessType;
  open: boolean;
  childOpen: boolean;
  onToggle: () => void;
  onToggleChild: () => void;
  onEdit: () => void;
  onCancel: () => void;
  typeBadgeClass: string;
  typeLabel: string;
  binNumber: string | null;
  childBinNumber: string | null;
  isDelivered: boolean;
}

export function FragmentRow({
  order,
  childOrder,
  businessType,
  open,
  childOpen,
  onToggle,
  onToggleChild,
  onEdit,
  onCancel,
  typeBadgeClass,
  typeLabel,
  binNumber,
  childBinNumber,
  isDelivered,
}: FragmentRowProps) {
  // 桶类型中文映射
  const binTypeNames: Record<string, string> = {
    'garbage': '垃圾桶',
    'brick': '砖桶',
    'soil': '土桶',
    'cement': '水泥桶',
    'asphalt': '沥青桶'
  };
  const binTypeName = order.bin_type ? binTypeNames[order.bin_type] || order.bin_type : '—';

  // 砖块订单类型标签
  const brickOrderTypeLabels: Record<string, string> = {
    'pickup_from_factory': '🏭 从砖厂取砖',
    'delivery_to_customer': '🚚 送砖给客户'
  };
  const brickOrderTypeLabel = order.brick_order_type ? brickOrderTypeLabels[order.brick_order_type] || order.brick_order_type : '—';

  const rowBgClass = order.status === "done"
    ? "bg-green-100 hover:bg-green-200 text-green-900"
    : order.status === "cancelled"
      ? "bg-gray-100 text-gray-400 hover:bg-gray-200 line-through"
      : isDelivered
        ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-900"
        : "hover:bg-accent/40";

  return (
    <>
      <tr className={cn("border-t cursor-pointer", rowBgClass)} onClick={onToggle}>
        <td className="px-3 py-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        <td className="px-3 py-2 font-mono text-xs">
          {order.order_number}
          {(order.type === "pickup" || order.type === "swap") && !order.linked_order_id && (
            <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-100 text-amber-700 text-[9px] px-1 py-0.5 font-normal">
              未关联
            </span>
          )}
        </td>
        {businessType === 'garbage' && (
          <>
            <td className="px-3 py-2">
              <Badge className={cn("text-xs font-semibold", typeBadgeClass)}>{typeLabel}</Badge>
            </td>
            <td className="px-3 py-2">{binTypeName}</td>
            <td className="px-3 py-2">{order.bin_size ? `${order.bin_size}yd` : "—"}</td>
            <td className="px-3 py-2 font-mono text-xs">
              {binNumber ? (
                <span className="text-green-700 font-semibold">{binNumber}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
          </>
        )}
        {businessType === 'brick' && (
          <>
            <td className="px-3 py-2">
              <Badge className="text-xs">{brickOrderTypeLabel}</Badge>
            </td>
            <td className="px-3 py-2 text-xs text-muted-foreground">
              {order.brick_order_type === 'pickup_from_factory' ? '砖厂' : '场地'}
            </td>
            <td className="px-3 py-2 text-xs text-muted-foreground">
              {order.brick_order_type === 'pickup_from_factory' ? '场地' : '客户'}
            </td>
          </>
        )}
        <td className="px-3 py-2">{order.service_date}</td>
        <td className="px-3 py-2">{order.time_window === "custom" ? order.time_window_custom : order.time_window}</td>
        <td className="px-3 py-2 max-w-[240px] truncate">{order.address}</td>
        <td className="px-3 py-2">{order.customer_phone}</td>
        <td className="px-3 py-2">
          <Badge className={cn("text-xs", ORDER_STATUS_CLASS[order.status || 'pending'])}>{ORDER_STATUS_LABEL[order.status || 'pending']}</Badge>
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="icon" variant="ghost" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
            {order.status !== "cancelled" && (
              <Button size="icon" variant="ghost" onClick={onCancel}><X className="h-4 w-4" /></Button>
            )}
          </div>
        </td>
      </tr>
      {/* 换桶子行: 对应的收桶订单 (缩进, 小字, 浅色, 可点击展开) */}
      {childOrder && (
        <tr className="border-t bg-amber-50/40 cursor-pointer hover:bg-amber-50" onClick={onToggleChild}>
          <td className="px-3 py-1 pl-8">
            {childOpen ? <ChevronDown className="h-3.5 w-3.5 text-amber-700" /> : <ChevronRight className="h-3.5 w-3.5 text-amber-700" />}
          </td>
          <td className="px-3 py-1 font-mono text-[11px] text-amber-800">{childOrder.order_number}</td>
          {businessType === 'garbage' && (
            <>
              <td className="px-3 py-1">
                <Badge className="text-[10px] bg-type-pickup text-type-pickup-foreground">收桶</Badge>
              </td>
              <td className="px-3 py-1 text-xs text-muted-foreground">{binTypeName}</td>
              <td className="px-3 py-1 text-xs text-muted-foreground">{childOrder.bin_size ? `${childOrder.bin_size}yd` : "—"}</td>
              <td className="px-3 py-1 font-mono text-[11px]">
                {childBinNumber ? (
                  <span className="text-green-700 font-semibold">{childBinNumber}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </>
          )}
          <td className="px-3 py-1 text-xs text-muted-foreground">{childOrder.service_date}</td>
          <td className="px-3 py-1 text-xs text-muted-foreground">{childOrder.time_window === "custom" ? childOrder.time_window_custom : childOrder.time_window}</td>
          <td className="px-3 py-1 max-w-[240px] truncate text-xs text-muted-foreground">{childOrder.address}</td>
          <td className="px-3 py-1 text-xs text-muted-foreground">{childOrder.customer_phone}</td>
          <td className="px-3 py-1"></td>
          <td className="px-3 py-1"></td>
        </tr>
      )}
      {open && <OrderDetailRow orderId={order.id} order={order} />}
      {childOpen && childOrder && <OrderDetailRow orderId={childOrder.id} order={childOrder} />}
    </>
  );
}
