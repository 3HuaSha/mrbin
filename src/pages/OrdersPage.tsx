import { useMemo, useState } from "react";
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
  status: string;
  netsuite_order_id: string | null;
  linked_order_id?: string | null;
};

export function OrdersPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [businessType, setBusinessType] = useBusinessType();
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [hideDone, setHideDone] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", from, to, statusFilter, typeFilter, businessType],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("*, linked_order_id")
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
  });

  const filtered = useMemo(() => {
    let list = orders;
    if (hideDone) list = list.filter(o => o.status !== "done" && o.status !== "cancelled");
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
  }, [orders, search, hideDone]);

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
        <div className="flex items-end">
          <Button
            size="sm"
            variant={hideDone ? "default" : "outline"}
            onClick={() => setHideDone(!hideDone)}
            className="mt-1"
          >
            {hideDone ? "✓ 只看活跃" : "显示全部"}
          </Button>
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
              <th className="px-3 py-2">客户</th>
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
              return (
                <FragmentRow
                  key={main.id}
                  order={main}
                  childOrder={child}
                  businessType={businessType}
                  open={isOpen}
                  onToggle={() => setExpanded(isOpen ? null : main.id)}
                  onEdit={() => setEditing(main)}
                  onCancel={() => {
                    if (confirm(`确定删除订单 ${main.order_number}?此操作不可恢复`)) cancelOrder.mutate(main.id);
                  }}
                  typeBadgeClass={tm.className}
                  typeLabel={tm.label}
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
  order, childOrder, businessType, open, onToggle, onEdit, onCancel, typeBadgeClass, typeLabel,
}: {
  order: Order; childOrder?: Order; businessType: BusinessType; open: boolean; onToggle: () => void; onEdit: () => void; onCancel: () => void;
  typeBadgeClass: string; typeLabel: string;
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

  return (
    <>
      <tr className="border-t hover:bg-accent/40 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        <td className="px-3 py-2 font-mono text-xs">{order.order_number}</td>
        {businessType === 'garbage' && (
          <>
            <td className="px-3 py-2">
              <Badge className={cn("text-xs font-semibold", typeBadgeClass)}>{typeLabel}</Badge>
            </td>
            <td className="px-3 py-2">{binTypeName}</td>
            <td className="px-3 py-2">{order.bin_size ? `${order.bin_size}yd` : "—"}</td>
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
        <td className="px-3 py-2">{order.customer_name}</td>
        <td className="px-3 py-2">{order.customer_phone}</td>
        <td className="px-3 py-2">
          <Badge className={cn("text-xs", ORDER_STATUS_CLASS[order.status])}>{ORDER_STATUS_LABEL[order.status]}</Badge>
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="icon" variant="ghost" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
            {order.status !== "cancelled" && order.status !== "done" && (
              <Button size="icon" variant="ghost" onClick={onCancel}><X className="h-4 w-4" /></Button>
            )}
          </div>
        </td>
      </tr>
      {/* 换桶子行: 对应的收桶订单 (缩进, 小字, 浅色) */}
      {childOrder && (
        <tr className="border-t bg-amber-50/40">
          <td className="px-3 py-1 pl-8">
            <span className="text-xs text-amber-700">↳</span>
          </td>
          <td className="px-3 py-1 font-mono text-[11px] text-amber-800">{childOrder.order_number}</td>
          {businessType === 'garbage' && (
            <>
              <td className="px-3 py-1">
                <Badge className="text-[10px] bg-type-pickup text-type-pickup-foreground">收桶</Badge>
              </td>
              <td className="px-3 py-1 text-xs text-muted-foreground">{binTypeName}</td>
              <td className="px-3 py-1 text-xs text-muted-foreground">{childOrder.bin_size ? `${childOrder.bin_size}yd` : "—"}</td>
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
          <td className="px-3 py-1 text-xs text-muted-foreground">{childOrder.customer_name}</td>
          <td className="px-3 py-1 text-xs text-muted-foreground">{childOrder.customer_phone}</td>
          <td className="px-3 py-1">
            <Badge className={cn("text-[10px]", ORDER_STATUS_CLASS[childOrder.status])}>{ORDER_STATUS_LABEL[childOrder.status]}</Badge>
          </td>
          <td className="px-3 py-1"></td>
        </tr>
      )}
      {open && <OrderDetailRow orderId={order.id} order={order} />}
    </>
  );
}

function OrderDetailRow({ orderId, order }: { orderId: string; order: Order }) {
  const { data: assignments = [] } = useQuery({
    queryKey: ["order-assignments", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatch_assignments")
        .select("*, profiles(name), vehicles(name, type), bins(bin_number), job_steps(*)")
        .eq("order_id", orderId);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 查找关联的 pickup 子订单的 job_steps (送达后收回/倒垃圾)
  const { data: pickupChain = [] } = useQuery({
    queryKey: ["order-pickup-chain", orderId, order.linked_order_id],
    enabled: !!order.linked_order_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatch_assignments")
        .select("*, profiles(name), job_steps(*)")
        .eq("order_id", order.linked_order_id);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 桶类型中文映射
  const binTypeNames: Record<string, string> = {
    'garbage': '垃圾桶',
    'brick': '砖桶',
    'soil': '土桶',
    'cement': '水泥桶',
    'asphalt': '沥青桶'
  };
  const binTypeName = order.bin_type ? binTypeNames[order.bin_type] || order.bin_type : '—';

  return (
    <tr className="bg-accent/20 border-t">
      <td colSpan={12} className="px-6 py-4">
        <LifecycleTimeline order={order} selfAssignments={assignments} linkedAssignments={pickupChain} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-4">
          <div>
            <div className="font-semibold mb-2">订单详情</div>
            <dl className="space-y-1 text-muted-foreground">
              <div><span className="text-foreground">桶类型:</span> {binTypeName}</div>
              <div><span className="text-foreground">备注:</span> {order.customer_notes || "—"}</div>
              <div><span className="text-foreground">NetSuite:</span> {order.netsuite_order_id || "—"}</div>
            </dl>
          </div>
          <div>
            <div className="font-semibold mb-2">排班 ({assignments.length})</div>
            {assignments.length === 0 ? (
              <div className="text-muted-foreground">尚未分配,请到排班看板。</div>
            ) : (
              assignments.map((a: any) => (
                <div key={a.id} className="rounded-md border bg-card p-3 mb-2">
                  <div className="text-sm">
                    司机: <b>{a.profiles?.name}</b> · 车辆: <b>{a.vehicles?.name} ({a.vehicles?.type})</b>
                    {a.bins?.bin_number && <> · 桶: <b>{a.bins.bin_number}</b></>}
                  </div>
                  <ol className="mt-2 space-y-1">
                    {(a.job_steps || []).sort((x: any, y: any) => x.step_number - y.step_number).map((s: any) => (
                      <li key={s.id} className="text-xs flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{s.step_number}</Badge>
                        <span className="text-muted-foreground">{s.location}</span>
                        <Badge className={cn("text-[10px]", s.status === "done" ? "bg-status-done/15 text-status-done" : s.status === "in_progress" ? "bg-status-progress/15 text-status-progress" : "bg-muted")}>
                          {s.status}
                        </Badge>
                        {s.photo_url && <a href={s.photo_url} target="_blank" rel="noreferrer" className="text-primary underline">照片</a>}
                      </li>
                    ))}
                  </ol>
                </div>
              ))
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function EditOrderDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    address: order.address,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    customer_notes: order.customer_notes || "",
    netsuite_order_id: order.netsuite_order_id || "",
    service_date: order.service_date,
  });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("orders")
        .update({ ...form, customer_notes: form.customer_notes || null, netsuite_order_id: form.netsuite_order_id || null, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("已保存"); qc.invalidateQueries({ queryKey: ["orders"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>编辑订单 {order.order_number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>地址</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>客户姓名</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
            <div><Label>电话</Label><Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: formatPhone(e.target.value) })} /></div>
          </div>
          <div><Label>服务日期</Label><Input type="date" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} /></div>
          <div><Label>NetSuite 订单号</Label><Input value={form.netsuite_order_id} onChange={(e) => setForm({ ...form, netsuite_order_id: e.target.value })} /></div>
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

function LifecycleTimeline({ order, selfAssignments, linkedAssignments }: {
  order: Order;
  selfAssignments: any[];
  linkedAssignments: any[];
}) {
  // 收集所有相关 job_steps
  const allSteps: any[] = [];
  selfAssignments.forEach(a => (a.job_steps || []).forEach((s: any) => allSteps.push({ ...s, _assignment: a })));
  linkedAssignments.forEach(a => (a.job_steps || []).forEach((s: any) => allSteps.push({ ...s, _assignment: a })));

  // 提取关键节点
  const deliveredStep = allSteps.find(s =>
    (s.step_type === "delivery" || s.step_type === "customer_delivery" || s.step_type === "swap") &&
    s.status === "done"
  );
  const pickedUpStep = allSteps.find(s =>
    (s.step_type === "pickup" || s.step_type === "customer_pickup") &&
    s.status === "done"
  );
  const dumpStep = allSteps.find(s => s.step_type === "dump_site" && s.status === "done");

  const deliveredAt = deliveredStep?.completed_at;
  const pickedUpAt = pickedUpStep?.completed_at;
  const dumpedAt = dumpStep?.completed_at;

  // 阶段状态
  const stage1Done = !!deliveredAt;        // 送达
  const stage2Done = stage1Done;            // 在场使用 (送达后自然进入)
  const stage3Done = !!pickedUpAt;         // 回收
  const stage4Done = !!dumpedAt;           // 称重

  // 如果订单本身就是 pickup/material 类型, 首阶段跳过
  const isPickupOnly = order.type === "pickup";

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
            width: `${(stage1Done ? 1 : 0) * 33 + (stage3Done ? 1 : 0) * 33 + (stage4Done ? 1 : 0) * 33}%`,
            maxWidth: "calc(100% - 64px)"
          }}
        />

        <div className="relative flex w-full gap-1" style={{ zIndex: 1 }}>
          {!isPickupOnly && (
            <Stage
              active={!stage1Done}
              done={stage1Done}
              label="送达"
              time={deliveredAt}
              detail={deliveredStep?._assignment?.profiles?.name ? `司机: ${deliveredStep._assignment.profiles.name}` : undefined}
            />
          )}
          {!isPickupOnly && (
            <Stage
              active={stage1Done && !stage3Done}
              done={stage2Done && stage3Done}
              label="在场使用"
              time={null}
              detail={stage1Done && !stage3Done ? "桶在客户处" : undefined}
            />
          )}
          <Stage
            active={(isPickupOnly || stage1Done) && !stage3Done}
            done={stage3Done}
            label="回收"
            time={pickedUpAt}
            detail={pickedUpStep?._assignment?.profiles?.name ? `司机: ${pickedUpStep._assignment.profiles.name}` : undefined}
          />
          <Stage
            active={stage3Done && !stage4Done}
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
