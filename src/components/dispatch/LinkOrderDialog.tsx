import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Link, Unlink, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Order } from "@/types/dispatch";
import { typeMeta } from "@/lib/business";
import { cn } from "@/lib/utils";

interface LinkOrderDialogProps {
  stepId: string;
  currentOrderId: string | null;
  onSelect: (orderId: string | null) => void;
  onClose: () => void;
}

export function LinkOrderDialog({
  currentOrderId,
  onSelect,
  onClose,
}: LinkOrderDialogProps) {
  const [search, setSearch] = useState("");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["link-order-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .neq("status", "cancelled")
        .order("service_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Order[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const s = search.toLowerCase();
    return orders.filter(o => 
      o.order_number.toLowerCase().includes(s) ||
      o.customer_name.toLowerCase().includes(s) ||
      o.address.toLowerCase().includes(s)
    );
  }, [orders, search]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-4 w-4" /> 关联订单
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="搜索订单号/客户/地址…" 
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {currentOrderId && (
              <div className="mb-4">
                <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1 px-1">当前关联</div>
                <Button
                  variant="outline"
                  className="w-full justify-between h-auto py-2 px-3 border-amber-200 bg-amber-50 hover:bg-amber-100 group"
                  onClick={() => onSelect(null)}
                >
                  <div className="flex items-center gap-3 text-left">
                    <Link className="h-4 w-4 text-amber-600" />
                    <div>
                      <div className="text-xs font-bold text-amber-900 leading-none mb-1">
                        {orders.find(o => o.id === currentOrderId)?.order_number || '已选订单'}
                      </div>
                      <div className="text-[10px] text-amber-700 truncate max-w-[300px]">
                        {orders.find(o => o.id === currentOrderId)?.address || ''}
                      </div>
                    </div>
                  </div>
                  <Unlink className="h-4 w-4 text-amber-400 group-hover:text-destructive transition-colors" />
                </Button>
              </div>
            )}

            <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1 px-1">可选订单 (最近50条)</div>
            
            {isLoading && <div className="text-center py-8 text-sm text-muted-foreground italic">加载中…</div>}
            
            {!isLoading && filtered.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">没有找到匹配的订单</div>
            )}

            {filtered.map(o => {
              const tm = typeMeta(o.type);
              const isCurrent = o.id === currentOrderId;
              if (isCurrent) return null;

              return (
                <button
                  key={o.id}
                  className="w-full text-left p-2.5 rounded-lg hover:bg-muted transition-colors border border-transparent hover:border-muted-foreground/10 flex items-center gap-3 group"
                  onClick={() => onSelect(o.id)}
                >
                  <div className={cn("h-8 w-8 rounded flex items-center justify-center shrink-0", tm.className)}>
                    {tm.emoji}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold font-mono">{o.order_number}</span>
                      <Badge variant="outline" className="text-[9px] h-3.5 px-1 leading-none">{tm.label}</Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">{o.service_date}</span>
                    </div>
                    <div className="text-[10px] font-medium leading-none mb-1">{o.customer_name}</div>
                    <div className="text-[9px] text-muted-foreground truncate">{o.address}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-all mr-1" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-3 border-t bg-muted/30 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8">取消</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}
