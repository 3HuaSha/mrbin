import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Order } from "@/types/dispatch";

interface LinkPickerPanelProps {
  order: Order;
  assignments?: any[];
}

export function LinkPickerPanel({ order, assignments = [] }: LinkPickerPanelProps) {
  const qc = useQueryClient();

  // 从换桶步骤中提取收旧桶的照片和桶号，帮助用户识别应该关联哪个旧送桶订单
  const swapStep = assignments.flatMap((a: any) => a.job_steps || []).find((s: any) =>
    (s.step_type === "swap" || s.step_type === "customer_delivery") &&
    s.status === "done" &&
    (s.pickup_photo_url || s.old_bin_number_reported)
  );
  const pickupPhotoUrl = swapStep?.pickup_photo_url;
  const oldBinNumber = swapStep?.old_bin_number_reported;

  // 按地址 + 尺寸搜索同地址未回收的 delivery 候选
  const { data: candidates = [] } = useQuery({
    queryKey: ["link-candidates", order.address, order.bin_size, order.id],
    enabled: (order.type === "pickup" ? !order.order_number : !order.linked_order_id) && !!order.bin_size && order.address.length >= 3,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, address, bin_size, service_date, customer_name, linked_order_id, dispatch_assignments(job_steps(bin_number_reported))")
        .eq("type", "delivery" as any)
        .ilike("address", `%${order.address.trim()}%`)
        .eq("bin_size", order.bin_size as any)
        .is("linked_order_id", null)
        .order("service_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const bind = useMutation({
    mutationFn: async (deliveryId: string) => {
      // 获取送桶订单号
      const { data: deliveryOrder, error: fetchErr } = await supabase
        .from("orders")
        .select("order_number")
        .eq("id", deliveryId)
        .single();
      if (fetchErr || !deliveryOrder) throw new Error("无法找到送桶订单");

      // 更新当前未关联的 pickup: 沿用送桶单号 + 双向关联
      const { error: updateErr } = await supabase
        .from("orders")
        .update({
          order_number: deliveryOrder.order_number,
          linked_order_id: deliveryId,
        })
        .eq("id", order.id);
      if (updateErr) throw updateErr;

      // 送桶订单的 linked_order_id 指向收桶子单
      const { error: linkErr } = await supabase
        .from("orders")
        .update({ linked_order_id: order.id })
        .eq("id", deliveryId);
      if (linkErr) throw linkErr;
    },
    onSuccess: () => {
      toast.success("已关联：收桶订单已绑定送桶单");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order-chain"] });
      qc.invalidateQueries({ queryKey: ["link-candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-3 mb-3">
      <div className="text-sm font-semibold text-amber-800 mb-2">
        ⚠️ 未关联送桶单 · 可手动绑定
      </div>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {candidates.length === 0 ? (
            <div className="text-xs text-amber-700 italic">
              未找到同地址 {order.bin_size}yd 的未回收桶。确认地址/尺寸, 或保持未关联。
            </div>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {candidates.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => bind.mutate(c.id)}
                  disabled={bind.isPending}
                  className="w-full flex items-center justify-between px-3 py-2 rounded border-2 bg-white border-gray-200 hover:border-blue-400 text-left transition-all"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm">{c.order_number}</span>
                      {(() => {
                        const bn = (c.dispatch_assignments ?? []).flatMap((a: any) => a.job_steps ?? []).map((s: any) => s.bin_number_reported).filter(Boolean)[0];
                        return bn ? <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">桶号: {bn}</span> : null;
                      })()}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {c.service_date} · {c.customer_name} · {c.bin_size}yd · {c.address}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-blue-600">绑定 →</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {(pickupPhotoUrl || oldBinNumber) && (
          <div className="shrink-0 border-2 border-amber-300 rounded-lg p-2 bg-white min-w-[120px] text-center">
            <div className="text-[10px] font-semibold text-amber-800 mb-1">收旧桶参考</div>
            {oldBinNumber && (
              <div className="text-sm font-mono font-bold text-primary mb-1">桶号: {oldBinNumber}</div>
            )}
            {pickupPhotoUrl && (
              <a href={pickupPhotoUrl} target="_blank" rel="noreferrer">
                <img src={pickupPhotoUrl} alt="收旧桶照片" className="w-24 h-24 object-cover rounded border cursor-pointer hover:opacity-80" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
