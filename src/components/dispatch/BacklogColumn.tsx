import React, { useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { Order } from "@/types/dispatch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OrderCardDisplay } from "./OrderCardDisplay";
import { SortableOrderCard } from "./SortableOrderCard";

import { isAMTimeWindow, isPMTimeWindow } from "@/lib/business";

const BACKLOG_ID = "__backlog__";

interface BacklogColumnProps {
  orders: Order[];
  completedOrders: Order[];
  cardId: {
    fromOrder: (id: string) => string;
  };
}

export function BacklogColumn({ 
  orders, 
  completedOrders, 
  cardId
}: BacklogColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: BACKLOG_ID });
  const [timeFilter, setTimeFilter] = useState<'ALL' | 'AM' | 'PM'>('ALL');
  
  // 根据时间段筛选订单
  const filteredOrders = useMemo(() => {
    if (timeFilter === 'ALL') return orders;
    if (timeFilter === 'AM') {
      return orders.filter(o => isAMTimeWindow(o.time_window, o.time_window_custom));
    }
    if (timeFilter === 'PM') {
      return orders.filter(o => isPMTimeWindow(o.time_window, o.time_window_custom));
    }
    return orders;
  }, [orders, timeFilter, isAMTimeWindow, isPMTimeWindow]);

  // 按类型分列: 送+换 vs 收
  const deliverySwapOrders = useMemo(() => 
    filteredOrders.filter(o => o.type === 'delivery' || o.type === 'swap' || o.type === 'material'), 
    [filteredOrders]
  );
  const pickupOrders = useMemo(() => 
    filteredOrders.filter(o => o.type === 'pickup'), 
    [filteredOrders]
  );

  return (
    <div className="w-[340px] flex flex-col h-full bg-muted/30 rounded-lg">
      <div className="px-3 py-2 border-b bg-card rounded-t-lg">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-semibold text-sm tracking-tight">📥 待排班</div>
            <div className="text-[10px] text-muted-foreground">未分配订单</div>
          </div>
          <Badge variant="secondary" className="px-1.5">{filteredOrders.length}/{orders.length}</Badge>
        </div>
        
        {/* 时间段筛选按钮 */}
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={timeFilter === 'ALL' ? 'default' : 'outline'}
            onClick={() => setTimeFilter('ALL')}
            className="flex-1 h-7 text-xs"
          >
            全部
          </Button>
          <Button
            size="sm"
            variant={timeFilter === 'AM' ? 'default' : 'outline'}
            onClick={() => setTimeFilter('AM')}
            className="flex-1 h-7 text-xs"
          >
            AM
          </Button>
          <Button
            size="sm"
            variant={timeFilter === 'PM' ? 'default' : 'outline'}
            onClick={() => setTimeFilter('PM')}
            className="flex-1 h-7 text-xs"
          >
            PM
          </Button>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 overflow-y-auto transition-colors",
          isOver && "bg-primary/5"
        )}
      >
        <div className="flex h-full">
          {/* 左列: 送+换 */}
          <div className="flex-1 border-r p-1 space-y-1 overflow-y-auto">
            <div className="sticky top-0 bg-muted/80 backdrop-blur-sm rounded px-2 py-1 text-[10px] font-bold text-muted-foreground flex items-center justify-between z-10">
              <span>📦 送桶 / 换桶 / 砂石料</span>
              <Badge variant="outline" className="text-[9px] h-4 px-1">{deliverySwapOrders.length}</Badge>
            </div>
            <SortableContext
              items={deliverySwapOrders.map((o) => cardId.fromOrder(o.id))}
              strategy={verticalListSortingStrategy}
            >
              {deliverySwapOrders.map((o) => (
                <SortableOrderCard key={o.id} id={cardId.fromOrder(o.id)}>
                  <OrderCardDisplay order={o} binNumber={null} />
                </SortableOrderCard>
              ))}
            </SortableContext>
            {deliverySwapOrders.length === 0 && (
              <div className="text-center text-muted-foreground text-[10px] py-4">无</div>
            )}
          </div>

          {/* 右列: 收 */}
          <div className="flex-1 p-1 space-y-1 overflow-y-auto">
            <div className="sticky top-0 bg-muted/80 backdrop-blur-sm rounded px-2 py-1 text-[10px] font-bold text-muted-foreground flex items-center justify-between z-10">
              <span>📤 收桶</span>
              <Badge variant="outline" className="text-[9px] h-4 px-1">{pickupOrders.length}</Badge>
            </div>
            <SortableContext
              items={pickupOrders.map((o) => cardId.fromOrder(o.id))}
              strategy={verticalListSortingStrategy}
            >
              {pickupOrders.map((o) => (
                <SortableOrderCard key={o.id} id={cardId.fromOrder(o.id)}>
                  <OrderCardDisplay order={o} binNumber={null} />
                </SortableOrderCard>
              ))}
            </SortableContext>
            {pickupOrders.length === 0 && (
              <div className="text-center text-muted-foreground text-[10px] py-4">无</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
