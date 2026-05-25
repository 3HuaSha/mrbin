import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Order } from "@/types/dispatch";
import { LifecycleTimeline } from "./LifecycleTimeline";
import { LinkPickerPanel } from "./LinkPickerPanel";

interface OrderDetailRowProps {
  orderId: string;
  order: Order;
}

export function OrderDetailRow({ order, orderId }: OrderDetailRowProps) {
  // 归一化规则: 同一 order_number 下所有记录看作同一条"订单链"
  const { data: chain = [] } = useQuery({
    queryKey: ["order-chain", order.order_number],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("order_number", order.order_number);
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  // 决定"展示主视角": 同号链里优先 delivery, 其次 swap, 最后 pickup
  const primary: Order = (() => {
    if (chain.length === 0) return order;
    const byPriority = ["delivery", "swap", "pickup", "material"] as const;
    for (const t of byPriority) {
      const found = chain.find(o => o.type === t);
      if (found) return found;
    }
    return chain[0];
  })();

  // 链里所有订单 id, 用来一次性拉齐所有相关排班
  const chainIds = chain.length ? chain.map(o => o.id) : [order.id];

  const { data: assignments = [] } = useQuery({
    queryKey: ["chain-assignments", chainIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatch_assignments")
        .select("*, profiles(name), vehicles(name, type), bins(bin_number), orders(order_number, type), job_steps(*)")
        .in("order_id", chainIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 如果链里某条记录通过 linked_order_id 指向一个不同 order_number 的订单 (比如 pickup 子单 -> 新 swap 单),
  const externalLinkedIds = chain
    .map(o => o.linked_order_id)
    .filter((id): id is string => !!id && !chainIds.includes(id));
  const externalIdKey = externalLinkedIds.join(",");

  const { data: externalLinkedOrders = [] } = useQuery({
    queryKey: ["external-linked-orders", externalIdKey],
    enabled: externalLinkedIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, type, status, service_date")
        .in("id", externalLinkedIds);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; type: string; status: string; service_date: string }>;
    },
  });

  const { data: externalAssignments = [] } = useQuery({
    queryKey: ["external-linked-assignments", externalIdKey],
    enabled: externalLinkedIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatch_assignments")
        .select("*, profiles(name), job_steps(*)")
        .in("order_id", externalLinkedIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 时间轴用: "linkedOrder" 代表对方状态, 取第一个外部关联的 delivery/swap
  const timelineLinkedOrder = externalLinkedOrders.find(o => o.type === "delivery" || o.type === "swap") ?? null;

  const allRelatedIds = [...chainIds, ...externalLinkedIds];
  const { data: orphanSteps = [] } = useQuery({
    queryKey: ["orphan-steps", allRelatedIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_steps")
        .select("*")
        .in("order_id", allRelatedIds)
        .is("assignment_id", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <tr className="bg-accent/20 border-t">
      <td colSpan={12} className="px-6 py-4">
        <LifecycleTimeline
          order={primary}
          linkedOrder={timelineLinkedOrder}
          selfAssignments={assignments}
          linkedAssignments={externalAssignments}
          orphanSteps={orphanSteps}
        />
        {(primary.type === "pickup" || primary.type === "swap") && !primary.linked_order_id && (
          <LinkPickerPanel order={primary} assignments={assignments} />
        )}
      </td>
    </tr>
  );
}
