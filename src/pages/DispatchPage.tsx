import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import {
  ChevronLeft, ChevronRight, AlertTriangle, MoreVertical, Plus, MapPin,
} from "lucide-react";
import {
  todayISO, typeMeta, vehicleCanCarry, ORDER_STATUS_LABEL,
} from "@/lib/business";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DndContext, type DragEndEvent, type DragStartEvent, PointerSensor,
  useSensor, useSensors, DragOverlay, useDroppable, closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAudit } from "@/hooks/use-audit";

type Order = {
  id: string;
  order_number: string;
  type: string;
  bin_size: string | null;
  service_date: string;
  time_window: string;
  time_window_custom: string | null;
  address: string;
  customer_name: string;
  customer_notes: string | null;
  status: string;
};
type Profile = { id: string; name: string };
type Vehicle = { id: string; name: string; type: "HINO" | "MACK"; max_bin_size: string | null };
type Bin = { id: string; bin_number: string; size: string; status: string };
type Assignment = {
  id: string;
  order_id: string;
  driver_id: string;
  vehicle_id: string;
  bin_id: string | null;
  scheduled_date: string;
  sequence: number;
  orders: Order;
  vehicles: Vehicle;
  bins: Bin | null;
};

const SLOTS = [
  { key: "AM", label: "🌅 AM" },
  { key: "PM", label: "🌆 PM" },
  { key: "7-9", label: "⏰ 7-9" },
] as const;
type SlotKey = (typeof SLOTS)[number]["key"];

const BACKLOG_ID = "__backlog__";

function slotOfOrder(o: Order): SlotKey {
  if (o.time_window === "AM" || o.time_window === "PM" || o.time_window === "7-9") {
    return o.time_window as SlotKey;
  }
  // custom 默认归 PM
  return "PM";
}

function timeLabel(o: Order) {
  return o.time_window === "custom" ? (o.time_window_custom || "自定义") : o.time_window;
}

// Droppable id 编码: `${columnId}::${slot}`,columnId 为 BACKLOG_ID 或 driverId
type DroppableMeta = { columnId: string; slot: SlotKey };
const dropId = (m: DroppableMeta) => `${m.columnId}::${m.slot}`;
const parseDropId = (id: string): DroppableMeta | null => {
  const [columnId, slot] = id.split("::");
  if (!columnId || !slot) return null;
  return { columnId, slot: slot as SlotKey };
};

// 卡片 id 编码:assignment 用 `a:<id>`,unassigned order 用 `o:<id>`
const cardId = {
  fromOrder: (id: string) => `o:${id}`,
  fromAssignment: (id: string) => `a:${id}`,
  parse: (id: string) => {
    if (id.startsWith("a:")) return { kind: "assignment" as const, id: id.slice(2) };
    if (id.startsWith("o:")) return { kind: "order" as const, id: id.slice(2) };
    return null;
  },
};

export function DispatchPage() {
  const qc = useQueryClient();
  const audit = useAudit();
  const [date, setDate] = useState(todayISO());
  const [assignDialog, setAssignDialog] = useState<{ order: Order; driverId: string } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles")
        .select("id,name").eq("role", "driver").eq("is_active", true).order("name");
      if (error) throw error;
      return data as Profile[];
    },
  });
  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles")
        .select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data as Vehicle[];
    },
  });
  const { data: bins = [] } = useQuery({
    queryKey: ["bins-depot"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bins")
        .select("*").eq("status", "depot").eq("is_active", true).order("bin_number");
      if (error) throw error;
      return data as Bin[];
    },
  });
  const { data: orders = [] } = useQuery({
    queryKey: ["dispatch-orders", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*")
        .eq("service_date", date).neq("status", "cancelled").order("created_at");
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ["dispatch-assignments", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("dispatch_assignments")
        .select("*, orders(*), vehicles(*), bins(*)")
        .eq("scheduled_date", date).order("sequence");
      if (error) throw error;
      return (data ?? []) as unknown as Assignment[];
    },
  });

  const assignedOrderIds = useMemo(
    () => new Set(assignments.map((a) => a.order_id)),
    [assignments],
  );
  const unassigned = useMemo(
    () => orders.filter((o) => !assignedOrderIds.has(o.id)),
    [orders, assignedOrderIds],
  );

  // 司机当前选择的车辆 (本地)
  const [driverVehicle, setDriverVehicle] = useState<Record<string, string>>({});
  const getDriverVehicle = (driverId: string) => {
    if (driverVehicle[driverId]) return driverVehicle[driverId];
    const fromAssignment = assignments.find((a) => a.driver_id === driverId)?.vehicle_id;
    return fromAssignment ?? vehicles[0]?.id ?? "";
  };
  const getVehicle = (driverId: string) =>
    vehicles.find((v) => v.id === getDriverVehicle(driverId));

  // ============ Mutations ============
  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const asg = assignments.find((a) => a.id === id);
      const { error } = await supabase.from("dispatch_assignments").delete().eq("id", id);
      if (error) throw error;
      return asg;
    },
    onSuccess: (asg) => {
      toast.success("已取消分配");
      if (asg) {
        audit({
          action: "order_unassign",
          entity_type: "order",
          entity_id: asg.order_id,
          entity_label: asg.orders.order_number,
          details: { driver_id: asg.driver_id, vehicle_id: asg.vehicle_id },
        });
      }
      qc.invalidateQueries({ queryKey: ["dispatch-assignments", date] });
      qc.invalidateQueries({ queryKey: ["dispatch-orders", date] });
      qc.invalidateQueries({ queryKey: ["bins-depot"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveAssignment = useMutation({
    mutationFn: async (input: {
      id: string;
      driverId: string;
      vehicleId: string;
      sequence: number;
    }) => {
      const { error } = await supabase.from("dispatch_assignments")
        .update({
          driver_id: input.driverId,
          vehicle_id: input.vehicleId,
          sequence: input.sequence,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispatch-assignments", date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderInColumn = useMutation({
    mutationFn: async (rows: { id: string; sequence: number }[]) => {
      // 批量按 sequence 升序更新
      for (const r of rows) {
        const { error } = await supabase.from("dispatch_assignments")
          .update({ sequence: r.sequence }).eq("id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dispatch-assignments", date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ============ DnD ============
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const card = cardId.parse(active.id as string);
    if (!card) return;

    // over 可能是另一张卡片 id 或 droppable id
    let targetMeta: DroppableMeta | null = parseDropId(over.id as string);
    if (!targetMeta) {
      // 落在另一张卡片上 → 推断它所在的列/段
      const overCard = cardId.parse(over.id as string);
      if (!overCard) return;
      if (overCard.kind === "assignment") {
        const a = assignments.find((x) => x.id === overCard.id);
        if (!a) return;
        targetMeta = { columnId: a.driver_id, slot: slotOfOrder(a.orders) };
      } else {
        const o = orders.find((x) => x.id === overCard.id);
        if (!o) return;
        targetMeta = { columnId: BACKLOG_ID, slot: slotOfOrder(o) };
      }
    }

    // ---- 处理拖入目标 ----
    if (card.kind === "order") {
      // 从待排班拖到司机列 → 弹分配窗
      if (targetMeta.columnId === BACKLOG_ID) return;
      const order = orders.find((o) => o.id === card.id);
      if (!order) return;
      setAssignDialog({ order, driverId: targetMeta.columnId });
      return;
    }

    // assignment 拖动
    const a = assignments.find((x) => x.id === card.id);
    if (!a) return;

    // 拖回待排班列 → 视为取消分配
    if (targetMeta.columnId === BACKLOG_ID) {
      if (confirm(`将 ${a.orders.order_number} 移回待排班?`)) {
        removeAssignment.mutate(a.id);
      }
      return;
    }

    const targetDriver = targetMeta.columnId;
    const targetVehicleId = getDriverVehicle(targetDriver);

    // 同列同段:重排序
    const sameColumn = a.driver_id === targetDriver && slotOfOrder(a.orders) === targetMeta.slot;
    if (sameColumn) {
      const slotItems = assignments
        .filter((x) => x.driver_id === targetDriver && slotOfOrder(x.orders) === targetMeta!.slot)
        .sort((x, y) => x.sequence - y.sequence);
      const oldIndex = slotItems.findIndex((x) => x.id === a.id);
      let newIndex = oldIndex;
      const overParsed = cardId.parse(over.id as string);
      if (overParsed?.kind === "assignment") {
        newIndex = slotItems.findIndex((x) => x.id === overParsed.id);
      }
      if (newIndex < 0) newIndex = slotItems.length - 1;
      if (oldIndex === newIndex) return;
      const reordered = arrayMove(slotItems, oldIndex, newIndex);
      // 给整列(司机所有段)重新生成全局 sequence
      const driverAll = assignments
        .filter((x) => x.driver_id === targetDriver)
        .sort((x, y) => x.sequence - y.sequence);
      const replaceMap = new Map(reordered.map((x, i) => [x.id, i]));
      // 在 driverAll 中,把当前段替换为 reordered 顺序
      const slotIds = new Set(reordered.map((x) => x.id));
      const result: Assignment[] = [];
      let cursor = 0;
      for (const x of driverAll) {
        if (slotIds.has(x.id)) {
          result.push(reordered[cursor++]);
        } else {
          result.push(x);
        }
        void replaceMap;
      }
      reorderInColumn.mutate(
        result.map((x, i) => ({ id: x.id, sequence: i + 1 })),
      );
      return;
    }

    // 跨司机/跨段移动
    const targetCount = assignments.filter((x) => x.driver_id === targetDriver).length;
    moveAssignment.mutate({
      id: a.id,
      driverId: targetDriver,
      vehicleId: targetVehicleId,
      sequence: targetCount + 1,
    });
  };

  const activeCard = activeId ? cardId.parse(activeId) : null;
  const activeOrder =
    activeCard?.kind === "order"
      ? orders.find((o) => o.id === activeCard.id)
      : activeCard?.kind === "assignment"
        ? assignments.find((a) => a.id === activeCard.id)?.orders
        : undefined;

  // ============ Render ============
  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-4 h-screen flex flex-col">
        <div className="flex items-center justify-between mb-4 gap-4">
          <h1 className="text-2xl font-bold">排班看板</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              const d = new Date(date); d.setDate(d.getDate() - 1);
              setDate(d.toISOString().slice(0, 10));
            }}>
              <ChevronLeft className="h-4 w-4" /> 昨天
            </Button>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="px-3 py-1.5 rounded-md border bg-background text-sm"
            />
            <Button variant="outline" size="sm" onClick={() => setDate(todayISO())}>今天</Button>
            <Button variant="outline" size="sm" onClick={() => {
              const d = new Date(date); d.setDate(d.getDate() + 1);
              setDate(d.toISOString().slice(0, 10));
            }}>
              明天 <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-3 h-full pb-2">
              {/* 第一列:待排班 */}
              <BacklogColumn orders={unassigned} />

              {/* 司机列 */}
              {drivers.map((d) => {
                const list = assignments.filter((a) => a.driver_id === d.id)
                  .sort((x, y) => x.sequence - y.sequence);
                return (
                  <DriverColumn
                    key={d.id}
                    driver={d}
                    vehicle={getVehicle(d.id)}
                    vehicles={vehicles}
                    onChangeVehicle={(v) =>
                      setDriverVehicle((prev) => ({ ...prev, [d.id]: v }))
                    }
                    assignments={list}
                    onCancel={(id) => removeAssignment.mutate(id)}
                  />
                );
              })}
              {drivers.length === 0 && (
                <div className="self-center text-muted-foreground p-6">
                  尚无司机,请到车队页添加。
                </div>
              )}
            </div>
          </div>

          <DragOverlay>
            {activeOrder && (
              <div className="rotate-2">
                <OrderCardDisplay order={activeOrder} binNumber={null} ghost />
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {assignDialog && (
          <AssignDialog
            order={assignDialog.order}
            driverId={assignDialog.driverId}
            drivers={drivers}
            vehicles={vehicles}
            bins={bins}
            date={date}
            defaultVehicleId={getDriverVehicle(assignDialog.driverId)}
            existingCountByDriver={(id) =>
              assignments.filter((a) => a.driver_id === id).length
            }
            onClose={() => setAssignDialog(null)}
            onDone={() => {
              qc.invalidateQueries({ queryKey: ["dispatch-assignments", date] });
              qc.invalidateQueries({ queryKey: ["dispatch-orders", date] });
              qc.invalidateQueries({ queryKey: ["bins-depot"] });
              qc.invalidateQueries({ queryKey: ["orders"] });
              setAssignDialog(null);
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

// ============ Backlog Column ============
function BacklogColumn({ orders }: { orders: Order[] }) {
  const grouped = useMemo(() => {
    const m: Record<SlotKey, Order[]> = { AM: [], PM: [], "7-9": [] };
    orders.forEach((o) => m[slotOfOrder(o)].push(o));
    return m;
  }, [orders]);

  return (
    <div className="w-[300px] shrink-0 flex flex-col bg-muted/40 rounded-lg border">
      <div className="px-3 py-2.5 border-b bg-card rounded-t-lg flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">📥 待排班</div>
          <div className="text-[11px] text-muted-foreground">未分配订单</div>
        </div>
        <Badge variant="secondary">{orders.length}</Badge>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {SLOTS.map((s) => (
          <SlotZone
            key={s.key}
            columnId={BACKLOG_ID}
            slot={s.key}
            label={s.label}
            count={grouped[s.key].length}
            warn={false}
          >
            <SortableContext
              items={grouped[s.key].map((o) => cardId.fromOrder(o.id))}
              strategy={verticalListSortingStrategy}
            >
              {grouped[s.key].map((o) => (
                <SortableOrderCard key={o.id} id={cardId.fromOrder(o.id)}>
                  <OrderCardDisplay order={o} binNumber={null} />
                </SortableOrderCard>
              ))}
            </SortableContext>
          </SlotZone>
        ))}
        {orders.length === 0 && (
          <div className="text-center text-muted-foreground text-xs py-8">
            全部已排班 🎉
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Driver Column ============
function DriverColumn({
  driver, vehicle, vehicles, onChangeVehicle, assignments, onCancel,
}: {
  driver: Profile;
  vehicle: Vehicle | undefined;
  vehicles: Vehicle[];
  onChangeVehicle: (id: string) => void;
  assignments: Assignment[];
  onCancel: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const m: Record<SlotKey, Assignment[]> = { AM: [], PM: [], "7-9": [] };
    assignments.forEach((a) => m[slotOfOrder(a.orders)].push(a));
    return m;
  }, [assignments]);

  return (
    <div className="w-[300px] shrink-0 flex flex-col bg-muted/40 rounded-lg border">
      <div className="px-3 py-2.5 border-b bg-card rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm truncate">👤 {driver.name}</div>
          <Badge variant="secondary">{assignments.length}</Badge>
        </div>
        <Select value={vehicle?.id ?? ""} onValueChange={onChangeVehicle}>
          <SelectTrigger className="h-7 mt-1.5 text-xs">
            <SelectValue placeholder="选车辆" />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name} · {v.type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {SLOTS.map((s) => {
          const items = grouped[s.key];
          return (
            <SlotZone
              key={s.key}
              columnId={driver.id}
              slot={s.key}
              label={s.label}
              count={items.length}
              warn={items.length > 5}
            >
              <SortableContext
                items={items.map((a) => cardId.fromAssignment(a.id))}
                strategy={verticalListSortingStrategy}
              >
                {items.map((a) => {
                  const conflict = vehicle
                    ? !vehicleCanCarry(vehicle.type, a.orders.bin_size)
                    : false;
                  return (
                    <SortableOrderCard key={a.id} id={cardId.fromAssignment(a.id)}>
                      <OrderCardDisplay
                        order={a.orders}
                        binNumber={a.bins?.bin_number ?? null}
                        conflict={conflict}
                        conflictLabel={
                          conflict && vehicle
                            ? `${vehicle.type} 不支持 ${a.orders.bin_size}yd 桶`
                            : undefined
                        }
                        onCancel={() => {
                          if (confirm(`取消分配 ${a.orders.order_number}?`)) onCancel(a.id);
                        }}
                      />
                    </SortableOrderCard>
                  );
                })}
              </SortableContext>
            </SlotZone>
          );
        })}
      </div>

      <div className="border-t bg-card rounded-b-lg p-2 space-y-1">
        <div className="text-[11px] text-muted-foreground text-center">
          今日合计 <b className="text-foreground">{assignments.length}</b> 单
        </div>
        <Button asChild variant="outline" size="sm" className="w-full h-7 text-xs">
          <Link to="/">
            <Plus className="h-3 w-3" /> 直接添加
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ============ Slot Zone (droppable per slot) ============
function SlotZone({
  columnId, slot, label, count, warn, children,
}: {
  columnId: string;
  slot: SlotKey;
  label: string;
  count: number;
  warn: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId({ columnId, slot }) });
  return (
    <div>
      <div className={cn(
        "flex items-center justify-between px-1 py-1 text-[11px] uppercase tracking-wide",
        warn ? "text-status-progress font-bold" : "text-muted-foreground",
      )}>
        <span>{label}</span>
        <span>{count} 单 {warn && "⚠"}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-[60px] rounded-md p-1.5 space-y-1.5 transition-colors border border-dashed",
          isOver ? "bg-primary/10 border-primary" : "border-transparent",
        )}
      >
        {children}
        {count === 0 && (
          <div className="text-center text-[11px] text-muted-foreground/60 py-2">
            拖到此处
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Sortable wrapper ============
function SortableOrderCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

// ============ Order Card Display ============
function OrderCardDisplay({
  order, binNumber, conflict, conflictLabel, onCancel, ghost,
}: {
  order: Order;
  binNumber: string | null;
  conflict?: boolean;
  conflictLabel?: string;
  onCancel?: () => void;
  ghost?: boolean;
}) {
  const tm = typeMeta(order.type);
  return (
    <div
      className={cn(
        "relative rounded-md bg-card border shadow-sm pl-2.5 pr-2 py-2 cursor-grab active:cursor-grabbing select-none",
        conflict && "ring-2 ring-destructive border-destructive",
        ghost && "shadow-xl",
      )}
    >
      {/* 左侧色条 */}
      <div
        className={cn("absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full", `bg-type-${order.type}`)}
      />

      <div className="flex items-start gap-1.5 pl-1.5">
        <div className="flex-1 min-w-0">
          {/* 行 1:类型 + 桶尺寸 + 时间 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold">{tm.emoji} {tm.label}</span>
            {order.bin_size && (
              <Badge variant="outline" className="h-4 px-1 text-[10px]">
                {order.bin_size}yd
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">
              {timeLabel(order)}
            </span>
          </div>

          {/* 行 2:地址 */}
          <div className="flex items-center gap-1 mt-1 text-[11px] text-foreground/90 truncate">
            <MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{order.address}</span>
          </div>

          {/* 行 3:客户 + 桶号 */}
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
            <span className="truncate">{order.customer_name}</span>
            {binNumber && (
              <Badge className="h-4 px-1 text-[10px] bg-primary/10 text-primary border border-primary/30 ml-auto">
                {binNumber}
              </Badge>
            )}
          </div>

          {/* 客户备注 */}
          {order.customer_notes && (
            <div className="mt-1 inline-block bg-status-progress/15 text-status-progress text-[10px] px-1.5 py-0.5 rounded max-w-full truncate">
              📝 {order.customer_notes}
            </div>
          )}

          {/* 状态 */}
          {order.status !== "pending" && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              {ORDER_STATUS_LABEL[order.status]}
            </div>
          )}

          {/* 冲突警告 */}
          {conflict && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 mt-1 text-[10px] font-bold text-destructive">
                  <AlertTriangle className="h-3 w-3" /> 车型不匹配
                </div>
              </TooltipTrigger>
              <TooltipContent>{conflictLabel ?? "车型与桶规格不匹配"}</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* 三点菜单 */}
        {onCancel && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-0.5 rounded hover:bg-muted shrink-0"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem onClick={() => alert(`订单号:${order.order_number}\n${order.address}`)}>
                查看详情
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCancel} className="text-destructive">
                取消分配
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// ============ Assign Dialog ============
function AssignDialog({
  order, driverId, drivers, vehicles, bins, date, defaultVehicleId,
  existingCountByDriver, onClose, onDone,
}: {
  order: Order; driverId: string; drivers: Profile[]; vehicles: Vehicle[]; bins: Bin[];
  date: string; defaultVehicleId: string;
  existingCountByDriver: (id: string) => number;
  onClose: () => void; onDone: () => void;
}) {
  const [vehicleId, setVehicleId] = useState(defaultVehicleId || vehicles[0]?.id || "");
  const [binId, setBinId] = useState<string>("");
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const conflict = vehicle && !vehicleCanCarry(vehicle.type, order.bin_size);
  const driver = drivers.find((d) => d.id === driverId);

  const needsBin = order.type === "delivery" || order.type === "swap";
  const matchingBins = bins.filter((b) => !order.bin_size || b.size === order.bin_size);

  const audit = useAudit();
  const save = useMutation({
    mutationFn: async () => {
      const seq = existingCountByDriver(driverId) + 1;
      const { error } = await supabase.from("dispatch_assignments").insert({
        order_id: order.id,
        driver_id: driverId,
        vehicle_id: vehicleId,
        bin_id: binId || null,
        scheduled_date: date,
        sequence: seq,
      });
      if (error) throw error;
      return seq;
    },
    onSuccess: (seq) => {
      toast.success("已分配,步骤自动生成");
      const bin = bins.find((b) => b.id === binId);
      audit({
        action: "order_assign",
        entity_type: "order",
        entity_id: order.id,
        entity_label: order.order_number,
        details: {
          driver: driver?.name,
          vehicle: vehicle?.name,
          bin: bin?.bin_number,
          sequence: seq,
        },
      });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>分配订单 {order.order_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-muted p-3 space-y-1 text-xs">
            <div><b>司机:</b> {driver?.name}</div>
            <div><b>类型:</b> {typeMeta(order.type).label} {order.bin_size && `· ${order.bin_size}yd`}</div>
            <div><b>地址:</b> {order.address}</div>
            <div><b>客户:</b> {order.customer_name}</div>
          </div>
          <div>
            <Label className="text-xs">车辆</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name} ({v.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {conflict && (
              <div className="text-xs text-destructive flex items-center gap-1 mt-1">
                <AlertTriangle className="h-3 w-3" /> {vehicle!.type} 不支持 {order.bin_size}yd 桶
                (仍可保存,请手动换车)
              </div>
            )}
          </div>
          {needsBin && (
            <div>
              <Label className="text-xs">指定桶号 {order.type === "delivery" ? "(送桶)" : "(换桶 - 新桶)"}</Label>
              <Select value={binId || "none"} onValueChange={(v) => setBinId(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="不指定,司机现场选" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不指定 (司机现场选)</SelectItem>
                  {matchingBins.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.bin_number} ({b.size}yd, {b.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>确认分配</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
