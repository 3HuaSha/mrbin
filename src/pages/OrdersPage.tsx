import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { ORDER_STATUS_LABEL, ORDER_TYPES, todayISO, typeMeta } from "@/lib/business";
import { toast } from "sonner";
import { BusinessTypeSelector } from "@/components/BusinessTypeSelector";
import { useBusinessType } from "@/lib/business-type-storage";
import { Order } from "@/types/dispatch";

// 子组件导入
import { FragmentRow } from "@/components/orders/FragmentRow";
import { EditOrderDialog } from "@/components/orders/EditOrderDialog";
import { BulkBinOrderImportDialog } from "@/components/orders/BulkBinOrderImportDialog";

export function OrdersPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [businessType, setBusinessType] = useBusinessType();
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", from, to, statusFilter, typeFilter, businessType],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("*, linked_order_id, bin_number")
        .gte("service_date", from)
        .lte("service_date", to)
        .in("business_type", businessType === 'garbage' ? ['garbage', 'material'] : [businessType])
        .order("service_date", { ascending: true })
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
      if (typeFilter !== "all") q = q.eq("type", typeFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Order[];
    },
    refetchInterval: 15000, // 每15秒自动刷新, 及时反映司机完成状态
  });

  // 查询订单关联的桶号 (司机完成步骤后上报的 bin_number_reported)
  const { data: orderBinNumbers = {} } = useQuery({
    queryKey: ["order-bin-numbers", from, to, businessType],
    queryFn: async () => {
      // 通过 job_steps 获取桶号, 支持两种关联方式:
      // 1. job_steps.order_id 直接关联 (node_type='order' 的步骤)
      // 2. job_steps.assignment_id → dispatch_assignments.order_id
      const { data, error } = await supabase
        .from("job_steps")
        .select("order_id, bin_number_reported, old_bin_number_reported, step_type, assignment_id")
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .not("bin_number_reported", "is", null);
      if (error) throw error;

      // 对于有 assignment_id 但没有 order_id 的步骤, 需要查 dispatch_assignments
      const stepsNeedingOrderId = (data ?? []).filter(s => !s.order_id && s.assignment_id);
      let assignmentOrderMap: Record<string, string> = {};
      if (stepsNeedingOrderId.length > 0) {
        const assignmentIds = [...new Set(stepsNeedingOrderId.map(s => s.assignment_id!))];
        const { data: assignments } = await supabase
          .from("dispatch_assignments")
          .select("id, order_id")
          .in("id", assignmentIds);
        (assignments ?? []).forEach(a => { assignmentOrderMap[a.id] = a.order_id; });
      }

      // 按 order_id 汇总桶号
      const map: Record<string, string> = {};
      (data ?? []).forEach((step: any) => {
        const orderId: string | null = step.order_id || (step.assignment_id ? assignmentOrderMap[step.assignment_id] : null);
        if (!orderId) return;
        const bn: string | null = step.bin_number_reported;
        if (bn) {
          if (map[orderId] && !map[orderId].includes(bn)) {
            map[orderId] += `, ${bn}`;
          } else {
            map[orderId] = bn;
          }
        }
      });
      return map;
    },
    refetchInterval: 15000,
  });

  const { data: orderDeliveredSet = new Set<string>() } = useQuery({
    queryKey: ["order-delivered-status", from, to, businessType],
    queryFn: async () => {
      // 查找 customer_delivery 步骤已完成的 assignment
      const { data, error } = await supabase
        .from("job_steps")
        .select("assignment_id")
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .eq("step_type", "customer_delivery" as any)
        .eq("status", "done" as any);
      if (error) throw error;
      if (!data || data.length === 0) return new Set<string>();

      // 通过 assignment_id 找到 order_id
      const assignmentIds = [...new Set(data.map((s: any) => s.assignment_id).filter(Boolean))];
      if (assignmentIds.length === 0) return new Set<string>();

      const { data: assignments, error: aErr } = await supabase
        .from("dispatch_assignments")
        .select("order_id")
        .in("id", assignmentIds);
      if (aErr) throw aErr;

      return new Set((assignments ?? []).map((a: any) => a.order_id));
    },
    refetchInterval: 15000,
  });

  const filtered = useMemo(() => {
    let list = orders;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.order_number.toLowerCase().includes(s) ||
          o.customer_name.toLowerCase().includes(s) ||
          o.address.toLowerCase().includes(s),
      );
    }
    return list;
  }, [orders, search]);

  // 换桶: 把 pickup 挂在对应 delivery 下面作为子行, 不单独出现在列表顶层
  const groupedRows = useMemo(() => {
    const pickupByLinked = new Map<string, Order>();
    const pickupsByOrderNumber = new Map<string, Order[]>();
    filtered.forEach(o => {
      if (o.type === "pickup" && o.linked_order_id) pickupByLinked.set(o.linked_order_id, o);
      if (o.type === "pickup" && o.order_number) {
        const list = pickupsByOrderNumber.get(o.order_number) ?? [];
        list.push(o);
        pickupsByOrderNumber.set(o.order_number, list);
      }
    });
    const out: Array<{ main: Order; child?: Order }> = [];
    const consumedIds = new Set<string>();
    const choosePickup = (main: Order) => {
      const linked = pickupByLinked.get(main.id);
      if (linked) return linked;
      const sameNumberPickups = pickupsByOrderNumber.get(main.order_number) ?? [];
      return sameNumberPickups
        .filter(p => p.id !== main.id)
        .sort((a, b) => {
          const dateCompare = String(b.service_date).localeCompare(String(a.service_date));
          if (dateCompare !== 0) return dateCompare;
          return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
        })[0];
    };
    filtered.forEach(o => {
      // 跳过已经作为子行的 pickup
      const pickupMainByLinked = o.type === "pickup" && o.linked_order_id && filtered.some(x => x.id === o.linked_order_id);
      const pickupMainByNumber = o.type === "pickup" && filtered.some(x =>
        x.id !== o.id &&
        x.order_number === o.order_number &&
        (x.type === "delivery" || x.type === "swap")
      );
      if (pickupMainByLinked || pickupMainByNumber) {
        return;
      }
      if (consumedIds.has(o.id)) return;
      const child = choosePickup(o);
      out.push({ main: o, child });
      consumedIds.add(o.id);
      if (child) consumedIds.add(child.id);
    });
    return out;
  }, [filtered]);

  const cancelOrder = useMutation({
    mutationFn: async (id: string) => {
      const order = orders.find(o => o.id === id);
      const idsToDelete = [id];

      // 如果删除的是换桶订单，同时删除关联的 pickup 子单
      if (order?.type === "swap" && order.linked_order_id) {
        const linked = orders.find(o => o.id === order.linked_order_id);
        if (linked?.type === "pickup") {
          idsToDelete.push(linked.id);
        }
      }

      // 如果删除的是送桶订单，同时删除关联的收桶子单
      if (order?.type === "delivery" && order.linked_order_id) {
        const linked = orders.find(o => o.id === order.linked_order_id);
        if (linked?.type === "pickup") {
          idsToDelete.push(linked.id);
        }
      }

      // 如果删除的是 pickup 子单，同时检查是否有关联的 swap 主单需要解绑
      // （pickup 被删后 swap 主单的 linked_order_id 会在下面的清除逻辑中处理）

      for (const delId of idsToDelete) {
        // 先清关联表
        await supabase.from("job_steps").delete().eq("order_id", delId);
        await supabase.from("dispatch_assignments").delete().eq("order_id", delId);
      }

      // 解除其他订单对这些被删订单的 linked_order_id 引用（让关联订单回到未关联状态）
      for (const delId of idsToDelete) {
        await supabase.from("orders").update({ linked_order_id: null }).eq("linked_order_id", delId);
      }

      // 删除订单本体
      const { error } = await supabase.from("orders").delete().in("id", idsToDelete);
      if (error) throw error;
      return idsToDelete.length;
    },
    onSuccess: () => {
      toast.success("已删除订单");
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">订单管理</h1>
        <div className="flex items-center gap-3">
          <BusinessTypeSelector value={businessType} onChange={setBusinessType} />
          {businessType === "garbage" && <BulkBinOrderImportDialog />}
          <Button onClick={() => nav({ to: "/" })}>+ 新建订单</Button>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs text-muted-foreground">日期从</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40 mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">到</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40 mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">状态</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">类型</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              {ORDER_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs text-muted-foreground">搜索</Label>
          <div className="relative mt-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="客户名/地址/订单号"
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr className="text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2">订单号</th>
              {businessType === 'garbage' && (
                <>
                  <th className="px-3 py-2">类型</th>
                  <th className="px-3 py-2">桶类型/物料</th>
                  <th className="px-3 py-2">尺寸</th>
                  <th className="px-3 py-2">桶号</th>
                </>
              )}
              {businessType === 'brick' && (
                <>
                  <th className="px-3 py-2">订单类型</th>
                  <th className="px-3 py-2">起点</th>
                  <th className="px-3 py-2">终点</th>
                </>
              )}
              <th className="px-3 py-2">日期</th>
              <th className="px-3 py-2">时段</th>
              <th className="px-3 py-2">地址</th>
              <th className="px-3 py-2">电话</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">加载中…</td></tr>
            )}
            {!isLoading && groupedRows.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">暂无订单</td></tr>
            )}
            {groupedRows.map(({ main, child }) => {
              const tm = typeMeta(main.type);
              const isOpen = expanded === main.id;
              const isChildOpen = !!child && expanded === child.id;
              return (
                <FragmentRow
                  key={main.id}
                  order={main}
                  childOrder={child}
                  businessType={businessType}
                  open={isOpen}
                  childOpen={isChildOpen}
                  onToggle={() => setExpanded(isOpen ? null : main.id)}
                  onToggleChild={() => setExpanded(isChildOpen ? null : (child?.id ?? null))}
                  onEdit={() => setEditing(main)}
                  onCancel={() => {
                    if (confirm(`确定删除订单 ${main.order_number}?此操作不可恢复`)) cancelOrder.mutate(main.id);
                  }}
                  typeBadgeClass={tm.className}
                  typeLabel={tm.label}
                  binNumber={main.bin_number || orderBinNumbers[main.id] || null}
                  childBinNumber={child ? (child.bin_number || orderBinNumbers[child.id] || null) : null}
                  isDelivered={orderDeliveredSet.has(main.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && <EditOrderDialog order={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// OrdersPage.tsx 结束
