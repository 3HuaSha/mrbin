import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight, Pencil, X, Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { ORDER_STATUS_CLASS, ORDER_STATUS_LABEL, ORDER_TYPES, todayISO, typeMeta, formatPhone } from "@/lib/business";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BusinessTypeSelector } from "@/components/BusinessTypeSelector";
import { useBusinessType } from "@/lib/business-type-storage";
import type { BusinessType } from "@/lib/business";

type Order = {
  id: string;
  order_number: string;
  type: string;
  business_type?: BusinessType;
  brick_order_type?: string;
  origin_factory_id?: string;
  origin_yard_id?: string;
  destination_yard_id?: string;
  bin_size: string | null;
  bin_type: string | null;
  service_date: string;
  time_window: string;
  time_window_custom: string | null;
  address: string;
  customer_name: string;
  customer_phone: string;
  customer_notes: string | null;
  netsuite_order_id: string | null;
  linked_order_id?: string | null;
  bin_number?: string | null;
};

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
        .eq("business_type", businessType)
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
        const orderId = step.order_id || (step.assignment_id ? assignmentOrderMap[step.assignment_id] : null);
        if (!orderId) return;
        const bn = step.bin_number_reported;
        if (bn) {
          if (map[orderId] && !map[orderId].includes(bn)) {
            map[orderId] += `, ${bn}`;
          } else {
            map[orderId] = bn;
          }
        }
      });
      return map as Record<string, string>;
    },
    refetchInterval: 15000,
  });

  // 查询每个订单的"已送达"状态: customer_delivery 步骤 done 即视为已送达
  const { data: orderDeliveredSet = new Set<string>() } = useQuery({
    queryKey: ["order-delivered-status", from, to, businessType],
    queryFn: async () => {
      // 查找 customer_delivery 步骤已完成的 assignment
      const { data, error } = await supabase
        .from("job_steps")
        .select("assignment_id")
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .eq("step_type", "customer_delivery")
        .eq("status", "done");
      if (error) throw error;
      if (!data || data.length === 0) return new Set<string>();

      // 通过 assignment_id 找到 order_id
      const assignmentIds = [...new Set(data.map(s => s.assignment_id).filter(Boolean))];
      if (assignmentIds.length === 0) return new Set<string>();

      const { data: assignments, error: aErr } = await supabase
        .from("dispatch_assignments")
        .select("order_id")
        .in("id", assignmentIds);
      if (aErr) throw aErr;

      return new Set((assignments ?? []).map(a => a.order_id));
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
    filtered.forEach(o => {
      if (o.type === "pickup" && o.linked_order_id) pickupByLinked.set(o.linked_order_id, o);
    });
    const out: Array<{ main: Order; child?: Order }> = [];
    const consumedIds = new Set<string>();
    filtered.forEach(o => {
      // 跳过已经作为子行的 pickup
      if (o.type === "pickup" && o.linked_order_id && filtered.some(x => x.id === o.linked_order_id)) {
        return;
      }
      if (consumedIds.has(o.id)) return;
      const child = pickupByLinked.get(o.id);
      out.push({ main: o, child });
      if (child) consumedIds.add(child.id);
    });
    return out;
  }, [filtered]);

  const cancelOrder = useMutation({
    mutationFn: async (id: string) => {
      // 收集要一起删的相关订单 id
      const toDelete = new Set<string>([id]);
      const order = orders.find(o => o.id === id);

      // 1. 如果是换桶主单(swap), 顺带删 pickup 子单
      if (order?.type === "swap" && order.linked_order_id) {
        toDelete.add(order.linked_order_id);
      }
      // 2. 如果是 delivery/pickup 被换桶关联, 也删对方
      if (order?.linked_order_id) {
        toDelete.add(order.linked_order_id);
      }
      // 3. 反向查: 是否有其他订单 linked_order_id 指向要删的这些
      const { data: linkedOthers } = await supabase
        .from("orders")
        .select("id")
        .in("linked_order_id", Array.from(toDelete));
      (linkedOthers || []).forEach((o: any) => toDelete.add(o.id));

      const ids = Array.from(toDelete);

      // 4. 先清关联表 (外键不会级联时手动清)
      await supabase.from("job_steps").delete().in("order_id", ids);
      await supabase.from("dispatch_assignments").delete().in("order_id", ids);

      // 5. 解除其他订单对这些订单的 linked_order_id 引用, 避免 SET NULL 后孤儿
      await supabase.from("orders").update({ linked_order_id: null }).in("linked_order_id", ids);

      // 6. 删订单本体
      const { error } = await supabase.from("orders").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(count > 1 ? `已删除 ${count} 条订单 (含关联子单)` : "已删除订单");
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
                  <th className="px-3 py-2">桶类型</th>
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

function FragmentRow({
  order, childOrder, businessType, open, childOpen, onToggle, onToggleChild, onEdit, onCancel, typeBadgeClass, typeLabel, binNumber, childBinNumber, isDelivered,
}: {
  order: Order; childOrder?: Order; businessType: BusinessType;
  open: boolean; childOpen: boolean;
  onToggle: () => void; onToggleChild: () => void;
  onEdit: () => void; onCancel: () => void;
  typeBadgeClass: string; typeLabel: string;
  binNumber: string | null;
  childBinNumber: string | null;
  isDelivered: boolean;
}) {
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

  // 状态相关的行背景色:
  //   done -> 明显绿色
  //   已送达 (customer_delivery done) 但订单未完全完成 -> 浅绿色
  //   cancelled -> 灰
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
          <Badge className={cn("text-xs", ORDER_STATUS_CLASS[order.status])}>{ORDER_STATUS_LABEL[order.status]}</Badge>
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
          {businessType === 'brick' && (
            <>
              <td className="px-3 py-1"></td>
              <td className="px-3 py-1"></td>
              <td className="px-3 py-1"></td>
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

function OrderDetailRow({ orderId, order }: { orderId: string; order: Order }) {
  // 归一化规则: 同一 order_number 下所有记录看作同一条"订单链"
  // - 独立送桶单 SOT123 -> 链 = { SOT123-delivery }
  // - 换桶场景: SOT123-delivery (老送桶) + SOT123-pickup (换桶生成的子单, 指向新 swap KD-xx)
  //   换桶主单 KD-xx-swap 仍然独立存在, 但用户点的如果是 SOT123 (不论 delivery 还是 pickup),
  //   看到的详情应该把整条链的信息聚合进来
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
    const byPriority = ["delivery", "swap", "pickup"] as const;
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
  // 就把那个外部关联也拉进来, 它的排班和 job_steps 也要算入时间轴
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

  return (
    <tr className="bg-accent/20 border-t">
      <td colSpan={12} className="px-6 py-4">
        <LifecycleTimeline
          order={primary}
          linkedOrder={timelineLinkedOrder}
          selfAssignments={assignments}
          linkedAssignments={externalAssignments}
        />
        {(primary.type === "pickup" || primary.type === "swap") && !primary.linked_order_id && (
          <LinkPickerPanel order={primary} assignments={assignments} />
        )}
      </td>
    </tr>
  );
}

function EditOrderDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    type: order.type,
    bin_size: order.bin_size || "",
    bin_type: order.bin_type || "",
    time_window: order.time_window,
    time_window_custom: order.time_window_custom || "",
    address: order.address,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    customer_notes: order.customer_notes || "",
    netsuite_order_id: order.netsuite_order_id || "",
    service_date: order.service_date,
    status: order.status,
    bin_number: "",
  });

  // 查询该订单关联的桶号 (从 job_steps)
  const { data: existingBinNumber } = useQuery({
    queryKey: ["order-bin-number-edit", order.id],
    queryFn: async () => {
      // 先通过 dispatch_assignments 找到 job_steps
      const { data: assignments } = await supabase
        .from("dispatch_assignments")
        .select("id")
        .eq("order_id", order.id);
      if (!assignments || assignments.length === 0) return "";
      const assignmentIds = assignments.map(a => a.id);
      const { data: steps } = await supabase
        .from("job_steps")
        .select("bin_number_reported")
        .in("assignment_id", assignmentIds)
        .not("bin_number_reported", "is", null)
        .limit(1);
      return steps?.[0]?.bin_number_reported || "";
    },
  });

  // 初始化桶号
  useEffect(() => {
    if (order.bin_number) {
      setForm(f => ({ ...f, bin_number: order.bin_number! }));
    } else if (existingBinNumber && !form.bin_number) {
      setForm(f => ({ ...f, bin_number: existingBinNumber }));
    }
  }, [existingBinNumber, order.bin_number]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("orders")
        .update({
          type: form.type,
          bin_size: form.bin_size || null,
          bin_type: form.bin_type || null,
          time_window: form.time_window,
          time_window_custom: form.time_window_custom || null,
          address: form.address,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          customer_notes: form.customer_notes || null,
          netsuite_order_id: form.netsuite_order_id || null,
          service_date: form.service_date,
          status: form.status,
          bin_number: form.bin_number.trim().toUpperCase() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      if (error) throw error;

      // 保存桶号到 job_steps (如果有值)
      if (form.bin_number.trim()) {
        const binNum = form.bin_number.trim().toUpperCase();
        // 自动将新桶加入库存（如果不存在）
        const { error: binError } = await supabase
          .from("bins")
          .upsert(
            { bin_number: binNum, size: (form.bin_size || "20") as any },
            { onConflict: "bin_number", ignoreDuplicates: true }
          );
        if (binError) console.error("Auto-create bin error:", binError);

        const { data: assignments } = await supabase
          .from("dispatch_assignments")
          .select("id")
          .eq("order_id", order.id);
        if (assignments && assignments.length > 0) {
          const assignmentIds = assignments.map(a => a.id);
          // 更新所有关联步骤的 bin_number_reported (通常是 customer_delivery 或 customer_pickup)
          await supabase
            .from("job_steps")
            .update({ bin_number_reported: binNum })
            .in("assignment_id", assignmentIds)
            .in("step_type", ["customer_delivery", "customer_pickup", "depot_pickup"]);
        }
      }
    },
    onSuccess: () => { toast.success("已保存"); qc.invalidateQueries({ queryKey: ["orders"] }); qc.invalidateQueries({ queryKey: ["order-bin-numbers"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>编辑订单 {order.order_number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* 类型 + 状态 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>订单类型</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORDER_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>状态</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* 桶类型 + 桶大小 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>桶类型</Label>
              <Select value={form.bin_type} onValueChange={(v) => setForm({ ...form, bin_type: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="选择桶类型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="garbage">垃圾桶</SelectItem>
                  <SelectItem value="brick">砖桶</SelectItem>
                  <SelectItem value="soil">土桶</SelectItem>
                  <SelectItem value="cement">水泥桶</SelectItem>
                  <SelectItem value="asphalt">沥青桶</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>桶大小</Label>
              <Select value={form.bin_size} onValueChange={(v) => setForm({ ...form, bin_size: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="选择大小" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="14">14 yd</SelectItem>
                  <SelectItem value="20">20 yd</SelectItem>
                  <SelectItem value="30">30 yd</SelectItem>
                  <SelectItem value="40">40 yd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* 桶号 */}
          <div>
            <Label>桶号</Label>
            <Input className="mt-1" value={form.bin_number} onChange={(e) => setForm({ ...form, bin_number: e.target.value.toUpperCase() })} placeholder="如: B-20-01" />
          </div>
          {/* 时段 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>时段</Label>
              <Select value={form.time_window} onValueChange={(v) => setForm({ ...form, time_window: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AM">AM</SelectItem>
                  <SelectItem value="PM">PM</SelectItem>
                  <SelectItem value="7-9">7-9</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.time_window === "custom" && (
              <div>
                <Label>自定义时段</Label>
                <Input className="mt-1" value={form.time_window_custom} onChange={(e) => setForm({ ...form, time_window_custom: e.target.value })} placeholder="如: 10am-12pm" />
              </div>
            )}
          </div>
          {/* 地址 */}
          <div><Label>地址</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          {/* 客户信息 */}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>客户姓名</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
            <div><Label>电话</Label><Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: formatPhone(e.target.value) })} /></div>
          </div>
          {/* 日期 */}
          <div><Label>服务日期</Label><Input type="date" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} /></div>
          {/* NetSuite */}
          <div><Label>NetSuite 订单号</Label><Input value={form.netsuite_order_id} onChange={(e) => setForm({ ...form, netsuite_order_id: e.target.value })} /></div>
          {/* 备注 */}
          <div><Label>备注</Label><Textarea value={form.customer_notes} onChange={(e) => setForm({ ...form, customer_notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LifecycleTimeline({ order, linkedOrder, selfAssignments, linkedAssignments }: {
  order: Order;
  linkedOrder: { id: string; type: string; status: string; service_date: string } | null;
  selfAssignments: any[];
  linkedAssignments: any[];
}) {
  // 收集所有相关 job_steps
  const allSteps: any[] = [];
  const selfSteps: any[] = [];
  const linkedSteps: any[] = [];
  selfAssignments.forEach(a => (a.job_steps || []).forEach((s: any) => { const step = { ...s, _assignment: a }; allSteps.push(step); selfSteps.push(step); }));
  linkedAssignments.forEach(a => (a.job_steps || []).forEach((s: any) => { const step = { ...s, _assignment: a }; allSteps.push(step); linkedSteps.push(step); }));

  // 提取关键节点
  const deliveredStep = allSteps.find(s =>
    (s.step_type === "delivery" || s.step_type === "customer_delivery" || s.step_type === "swap") &&
    s.status === "done"
  );
  const pickedUpStep = allSteps.find(s =>
    (s.step_type === "pickup" || s.step_type === "customer_pickup") &&
    s.status === "done"
  );
  // 换桶场景：司机在 swap 步骤同时完成了"送新桶+收旧桶"，用 pickup_photo_url / old_bin_number_reported 作为回收证据
  // 注意：如果当前订单本身是 swap，那它自己的 swap step 不能作为"回收"证据（新桶还没被回收）
  // 只有关联方的 swap step 才算回收证据（意味着旧桶已被收走）
  const swapEvidenceSource = order.type === "swap" ? linkedSteps : allSteps;
  const swapPickupEvidence = swapEvidenceSource.find(s =>
    (s.step_type === "customer_delivery" || s.step_type === "swap") &&
    s.status === "done" &&
    (s.pickup_photo_url || s.old_bin_number_reported)
  );
  const dumpStep = allSteps.find(s => s.step_type === "dump_site" && s.status === "done");

  const deliveredAt = deliveredStep?.completed_at;
  const pickedUpAt = pickedUpStep?.completed_at ?? swapPickupEvidence?.completed_at;
  const dumpedAt = dumpStep?.completed_at;

  // 送达照片（新桶）和回收照片（旧桶）
  const deliveredPhotoUrl = deliveredStep?.photo_url;
  const pickedUpPhotoUrl = pickedUpStep?.photo_url ?? swapPickupEvidence?.pickup_photo_url;

  // 阶段状态 (要把当前订单和对方关联订单一起考虑, 让主单和子单看到的时间轴一致)
  //
  // 送达: 满足任一 => 亮绿
  //   a) 有 customer_delivery/swap step 已完成
  //   b) 当前订单本身是 delivery 且 status=done (覆盖历史导入单, 它们没 step 记录)
  //   c) 关联订单是 delivery 且 status=done/in_progress (比如 pickup/swap 订单关联了旧送桶单)
  //
  // 回收: customer_pickup step 已完成
  // 称重: dump_site step 已完成
  const linkedIsDoneDelivery = !!linkedOrder && linkedOrder.type === "delivery" && (linkedOrder.status === "done" || linkedOrder.status === "in_progress");
  const selfIsDoneDelivery = order.type === "delivery" && order.status === "done";
  const stage1Done = !!deliveredAt || selfIsDoneDelivery || linkedIsDoneDelivery;
  const stage3Done = !!pickedUpAt;
  const stage4Done = !!dumpedAt;

  // 如果这条订单本身是 pickup 且没有关联 delivery, 时间轴首个点显示"送达"还是跳过?
  // 保守: 除非关联了 delivery 才显示送达节点
  const showDelivered = order.type !== "pickup" || linkedIsDoneDelivery;

  const fmtTime = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const Stage = ({ active, done, label, time, detail }: {
    active: boolean; done: boolean; label: string; time?: string | null; detail?: React.ReactNode;
  }) => (
    <div className="flex-1 relative">
      <div className={cn(
        "flex items-center justify-center w-8 h-8 rounded-full mx-auto text-xs font-bold",
        done ? "bg-green-500 text-white" : active ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"
      )}>
        {done ? "✓" : active ? "•" : "○"}
      </div>
      <div className="text-center mt-1">
        <div className={cn("text-xs font-semibold", done ? "text-green-700" : active ? "text-blue-700" : "text-gray-400")}>
          {label}
        </div>
        {time && <div className="text-[10px] text-muted-foreground mt-0.5">{fmtTime(time)}</div>}
        {detail && <div className="text-[10px] text-muted-foreground mt-0.5">{detail}</div>}
      </div>
    </div>
  );

  return (
    <div className="bg-white border rounded-lg p-4 mb-3">
      <div className="text-sm font-semibold mb-3">🔄 订单生命周期</div>
      <div className="flex items-start gap-1 relative">
        {/* 连接线 */}
        <div className="absolute top-4 left-8 right-8 h-0.5 bg-gray-200" style={{ zIndex: 0 }} />
        <div
          className="absolute top-4 left-8 h-0.5 bg-green-500 transition-all"
          style={{
            zIndex: 0,
            width: `${(stage1Done ? 1 : 0) * 50 + (stage3Done ? 1 : 0) * 25 + (stage4Done ? 1 : 0) * 25}%`,
            maxWidth: "calc(100% - 64px)"
          }}
        />

        <div className="relative flex w-full gap-1" style={{ zIndex: 1 }}>
          {showDelivered && (
            <Stage
              active={false}
              done={stage1Done}
              label="送达"
              time={deliveredAt}
              detail={(deliveredStep?._assignment?.profiles?.name || deliveredPhotoUrl) ? (
                <div className="space-y-0.5">
                  {deliveredStep?._assignment?.profiles?.name && <div>司机: {deliveredStep._assignment.profiles.name}</div>}
                  {deliveredPhotoUrl && (
                    <a href={deliveredPhotoUrl} target="_blank" rel="noreferrer" className="text-primary underline">照片</a>
                  )}
                </div>
              ) : undefined}
            />
          )}
          <Stage
            active={false}
            done={stage3Done}
            label="回收"
            time={pickedUpAt}
            detail={(pickedUpStep?._assignment?.profiles?.name || swapPickupEvidence?._assignment?.profiles?.name || pickedUpPhotoUrl) ? (
              <div className="space-y-0.5">
                {(pickedUpStep?._assignment?.profiles?.name || swapPickupEvidence?._assignment?.profiles?.name) && (
                  <div>司机: {pickedUpStep?._assignment?.profiles?.name ?? swapPickupEvidence?._assignment?.profiles?.name}</div>
                )}
                {pickedUpPhotoUrl && (
                  <a href={pickedUpPhotoUrl} target="_blank" rel="noreferrer" className="text-primary underline">照片</a>
                )}
              </div>
            ) : undefined}
          />
          <Stage
            active={false}
            done={stage4Done}
            label="称重"
            time={dumpedAt}
            detail={dumpStep ? (
              <div className="space-y-0.5">
                {dumpStep.weight_kg != null && <div>{dumpStep.weight_kg} kg</div>}
                {dumpStep.dump_site && <div className="truncate max-w-[80px] mx-auto">{dumpStep.dump_site}</div>}
                {dumpStep.weigh_ticket_url && (
                  <a href={dumpStep.weigh_ticket_url} target="_blank" rel="noreferrer" className="text-primary underline">单据</a>
                )}
              </div>
            ) : undefined}
          />
        </div>
      </div>
    </div>
  );
}


// 收桶/换桶订单的"关联送桶单"面板: 可以手动绑定或解绑对应的 delivery
function LinkPickerPanel({ order, assignments = [] }: { order: Order; assignments?: any[] }) {
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
    enabled: !order.linked_order_id && !!order.bin_size && order.address.length >= 3,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, address, bin_size, service_date, customer_name, linked_order_id, dispatch_assignments(job_steps(bin_number_reported))")
        .eq("type", "delivery")
        .ilike("address", `%${order.address.trim()}%`)
        .eq("bin_size", order.bin_size!)
        .is("linked_order_id", null)
        .order("service_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const bind = useMutation({
    mutationFn: async (deliveryId: string) => {
      // 双向关联: 当前订单 -> delivery, delivery -> 当前订单
      const { error: e1 } = await supabase.from("orders").update({ linked_order_id: deliveryId }).eq("id", order.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("orders").update({ linked_order_id: order.id }).eq("id", deliveryId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("已关联");
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
