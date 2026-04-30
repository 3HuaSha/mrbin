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
  SortableContext, useSortable, verticalListSortingStrategy, rectSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAudit } from "@/hooks/use-audit";
import { DispatchMapWidget } from "@/components/DispatchMapWidget";

type Order = {
  id: string;
  order_number: string;
  type: string;
  bin_size: string | null;
  bin_type: string | null;
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
type JobStep = {
  id: string;
  driver_id: string;
  scheduled_date: string;
  step_number: number;
  order_id: string | null;
  assignment_id: string | null;
  node_type: 'order' | 'step';
  location: string;
  step_type: string;
  bin_id: string | null;
  notes: string | null;
  status: string;
};
type CommonLocation = {
  id: string;
  name: string;
  address: string;
  type: string;
};

const BACKLOG_ID = "__backlog__";

// 判断时间段是否属于 AM
function isAMTimeWindow(timeWindow: string, customTime: string | null): boolean {
  const time = timeWindow === "custom" ? (customTime || "") : timeWindow;
  const timeLower = time.toLowerCase();
  
  // AM 时段包括：
  // - 明确包含 "am" 的
  // - 7-9am, 8-10am 等
  // - noon 或 中午（如果在上午范围）
  if (timeLower.includes('am')) return true;
  if (timeLower.includes('noon') || timeLower.includes('中午')) {
    // noon 可能是 11-1 或 12-2，算作 AM
    return true;
  }
  
  return false;
}

// 判断时间段是否属于 PM
function isPMTimeWindow(timeWindow: string, customTime: string | null): boolean {
  const time = timeWindow === "custom" ? (customTime || "") : timeWindow;
  const timeLower = time.toLowerCase();
  
  // PM 时段包括：
  // - 明确包含 "pm" 的
  // - 不包含 am 和 noon 的其他时段
  if (timeLower.includes('pm')) return true;
  
  // 如果不是 AM 也不是明确的 noon，就算 PM
  if (!isAMTimeWindow(timeWindow, customTime)) return true;
  
  return false;
}

function timeLabel(o: Order) {
  return o.time_window === "custom" ? (o.time_window_custom || "自定义") : o.time_window;
}

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
  const [localAssignments, setLocalAssignments] = useState<Assignment[] | null>(null);
  const [localJobSteps, setLocalJobSteps] = useState<JobStep[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [insertStepAt, setInsertStepAt] = useState<{ driverId: string; position: number } | null>(null);

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

  // 查询 job_steps (包含订单节点和步骤节点)
  const { data: jobSteps = [] } = useQuery({
    queryKey: ["job-steps", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_steps")
        .select("*")
        .eq("scheduled_date", date)
        .order("driver_id")
        .order("step_number");
      if (error) throw error;
      return (data ?? []) as JobStep[];
    },
  });

  // 查询常用地点
  const { data: commonLocations = [] } = useQuery({
    queryKey: ["common-locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("common_locations")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CommonLocation[];
    },
  });

  const currentAssignments = localAssignments ?? assignments;

  // 区分已完成和未完成的订单
  const completedOrders = useMemo(() => orders.filter(o => o.status === "done"), [orders]);
  const activeOrders = useMemo(() => orders.filter(o => o.status !== "done"), [orders]);

  // 过滤出未完成的 assignments (用于司机列)
  const activeAssignments = useMemo(
    () => currentAssignments.filter(a => a.orders.status !== "done"),
    [currentAssignments]
  );

  const assignedOrderIds = useMemo(
    () => new Set(activeAssignments.map((a) => a.order_id)),
    [activeAssignments],
  );

  const unassigned = useMemo(
    () => activeOrders.filter((o) => !assignedOrderIds.has(o.id)),
    [activeOrders, assignedOrderIds],
  );

  // 司机当前选择的车辆 (本地)
  const [driverVehicle, setDriverVehicle] = useState<Record<string, string>>({});
  const getDriverVehicle = (driverId: string) => {
    if (driverVehicle[driverId]) return driverVehicle[driverId];
    const fromAssignment = currentAssignments.find((a) => a.driver_id === driverId)?.vehicle_id;
    return fromAssignment ?? vehicles[0]?.id ?? "";
  };
  const getVehicle = (driverId: string) =>
    vehicles.find((v) => v.id === getDriverVehicle(driverId));

  // ============ Mutations ============
  const saveAllChanges = useMutation({
    mutationFn: async () => {
      if (!localAssignments) return;
      const inserts = localAssignments.filter(a => a.id.startsWith("temp-"));
      const updates = localAssignments.filter(a => !a.id.startsWith("temp-"));
      const deletes = assignments.filter(a => !localAssignments.some(la => la.id === a.id));

      // 删除 assignments 和对应的 job_steps
      for (const d of deletes) {
        // 先删除关联的 job_steps
        await supabase.from("job_steps").delete().eq("assignment_id", d.id);
        // 再删除 assignment
        await supabase.from("dispatch_assignments").delete().eq("id", d.id);
      }
      
      // 插入新的 assignments 和 job_steps
      for (const i of inserts) {
        // 插入 assignment
        const { data: newAssignment, error: assignmentError } = await supabase
          .from("dispatch_assignments")
          .insert({
            order_id: i.order_id,
            driver_id: i.driver_id,
            vehicle_id: i.vehicle_id,
            bin_id: i.bin_id,
            scheduled_date: i.scheduled_date,
            sequence: i.sequence,
          })
          .select()
          .single();
        
        if (assignmentError) throw assignmentError;
        
        // 为这个 assignment 创建 job_steps（根据订单类型自动生成）
        const order = i.orders;
        const steps = [];
        
        if (order.type === "delivery") {
          steps.push({
            assignment_id: newAssignment.id,
            driver_id: i.driver_id,
            scheduled_date: i.scheduled_date,
            order_id: order.id,
            node_type: 'order' as const,
            step_number: i.sequence,
            step_type: 'delivery',
            location: order.address,
            status: 'locked',
          });
        } else if (order.type === "pickup") {
          steps.push({
            assignment_id: newAssignment.id,
            driver_id: i.driver_id,
            scheduled_date: i.scheduled_date,
            order_id: order.id,
            node_type: 'order' as const,
            step_number: i.sequence,
            step_type: 'pickup',
            location: order.address,
            status: 'locked',
          });
        } else if (order.type === "swap") {
          steps.push({
            assignment_id: newAssignment.id,
            driver_id: i.driver_id,
            scheduled_date: i.scheduled_date,
            order_id: order.id,
            node_type: 'order' as const,
            step_number: i.sequence,
            step_type: 'swap',
            location: order.address,
            status: 'locked',
          });
        }
        
        if (steps.length > 0) {
          const { error: stepsError } = await supabase.from("job_steps").insert(steps);
          if (stepsError) throw stepsError;
        }
      }
      
      // 更新现有的 assignments
      for (const u of updates) {
        const old = assignments.find(a => a.id === u.id);
        if (old && (old.sequence !== u.sequence || old.vehicle_id !== u.vehicle_id || old.driver_id !== u.driver_id)) {
          await supabase.from("dispatch_assignments").update({
            driver_id: u.driver_id,
            sequence: u.sequence,
            vehicle_id: u.vehicle_id
          }).eq("id", u.id);
          
          // 同时更新对应的 job_steps
          await supabase.from("job_steps").update({
            driver_id: u.driver_id,
            step_number: u.sequence,
          }).eq("assignment_id", u.id);
        }
      }
    },
    onSuccess: () => {
      toast.success("已保存并同步给相关司机");
      setLocalAssignments(null);
      qc.invalidateQueries({ queryKey: ["dispatch-assignments", date] });
      qc.invalidateQueries({ queryKey: ["dispatch-orders", date] });
      qc.invalidateQueries({ queryKey: ["job-steps", date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const insertManualStep = useMutation({
    mutationFn: async (params: {
      driverId: string;
      position: number;
      location: string;
      stepType: string;
      binId?: string;
      notes?: string;
    }) => {
      const { driverId, position, location, stepType, binId, notes } = params;
      
      // 获取该司机当天的所有步骤
      const driverSteps = (localJobSteps || jobSteps).filter(
        s => s.driver_id === driverId && s.scheduled_date === date
      ).sort((a, b) => a.step_number - b.step_number);
      
      // 在指定位置插入新步骤，并重新编号
      const newStep: JobStep = {
        id: `temp-step-${Date.now()}`,
        driver_id: driverId,
        scheduled_date: date,
        step_number: position,
        order_id: null,
        assignment_id: null,
        node_type: 'step',
        location,
        step_type: stepType,
        bin_id: binId || null,
        notes: notes || null,
        status: 'locked',
      };
      
      // 插入新步骤到数据库
      const { data, error } = await supabase.from("job_steps").insert({
        driver_id: newStep.driver_id,
        scheduled_date: newStep.scheduled_date,
        step_number: newStep.step_number,
        node_type: newStep.node_type,
        location: newStep.location,
        step_type: newStep.step_type,
        bin_id: newStep.bin_id,
        notes: newStep.notes,
        status: newStep.status,
      }).select().single();
      
      if (error) throw error;
      
      // 更新后续步骤的编号
      const stepsToUpdate = driverSteps.filter(s => s.step_number >= position);
      for (const step of stepsToUpdate) {
        await supabase.from("job_steps")
          .update({ step_number: step.step_number + 1 })
          .eq("id", step.id);
      }
      
      return data;
    },
    onSuccess: () => {
      toast.success("已插入步骤");
      setInsertStepAt(null);
      qc.invalidateQueries({ queryKey: ["job-steps", date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteManualStep = useMutation({
    mutationFn: async (stepId: string) => {
      const step = jobSteps.find(s => s.id === stepId);
      if (!step) throw new Error("步骤不存在");
      
      // 删除步骤
      const { error } = await supabase.from("job_steps").delete().eq("id", stepId);
      if (error) throw error;
      
      // 更新后续步骤的编号
      const laterSteps = jobSteps.filter(
        s => s.driver_id === step.driver_id && 
             s.scheduled_date === step.scheduled_date && 
             s.step_number > step.step_number
      );
      
      for (const laterStep of laterSteps) {
        await supabase.from("job_steps")
          .update({ step_number: laterStep.step_number - 1 })
          .eq("id", laterStep.id);
      }
    },
    onSuccess: () => {
      toast.success("已删除步骤");
      qc.invalidateQueries({ queryKey: ["job-steps", date] });
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

    let targetColumnId: string | null = null;
    const overParsed = cardId.parse(over.id as string);
    if (overParsed) {
      if (overParsed.kind === "assignment") {
        const a = currentAssignments.find((x) => x.id === overParsed.id);
        if (a) targetColumnId = a.driver_id;
      } else {
        targetColumnId = BACKLOG_ID;
      }
    } else {
      targetColumnId = over.id as string;
    }

    if (!targetColumnId) return;

    const newAssignments = [...currentAssignments];

    // ---- 处理拖入目标 ----
    if (card.kind === "order") {
      if (targetColumnId === BACKLOG_ID) return;
      const order = orders.find((o) => o.id === card.id);
      if (!order) return;

      const targetDriver = targetColumnId;
      const driverAsgs = newAssignments.filter(a => a.driver_id === targetDriver).sort((a, b) => a.sequence - b.sequence);

      let insertIndex = driverAsgs.length;
      if (overParsed && overParsed.kind === "assignment") {
        insertIndex = driverAsgs.findIndex(a => a.id === overParsed.id);
        if (insertIndex < 0) insertIndex = driverAsgs.length;
      }

      const targetVehicleId = getDriverVehicle(targetDriver);
      const newAsg: Assignment = {
        id: `temp-${Date.now()}-${order.id}`,
        order_id: order.id,
        driver_id: targetDriver,
        vehicle_id: targetVehicleId,
        bin_id: null,
        scheduled_date: date,
        sequence: 0,
        orders: order,
        vehicles: vehicles.find(v => v.id === targetVehicleId) || { id: "", name: "未选", type: "HINO", max_bin_size: null },
        bins: null
      };

      driverAsgs.splice(insertIndex, 0, newAsg);
      driverAsgs.forEach((a, i) => { a.sequence = i + 1; });

      const finalAssignments = newAssignments.filter(a => a.driver_id !== targetDriver).concat(driverAsgs);
      setLocalAssignments(finalAssignments);
      return;
    }

    // assignment 拖动
    const aIndex = newAssignments.findIndex(x => x.id === card.id);
    if (aIndex < 0) return;
    const a = newAssignments[aIndex];

    // 拖回待排班列
    if (targetColumnId === BACKLOG_ID) {
      newAssignments.splice(aIndex, 1);
      const driverAsgs = newAssignments.filter(x => x.driver_id === a.driver_id).sort((x, y) => x.sequence - y.sequence);
      driverAsgs.forEach((x, i) => x.sequence = i + 1);
      setLocalAssignments(newAssignments);
      return;
    }

    const targetDriver = targetColumnId;
    const sameColumn = a.driver_id === targetDriver;

    if (sameColumn) {
      const driverAsgs = newAssignments
        .filter((x) => x.driver_id === targetDriver)
        .sort((x, y) => x.sequence - y.sequence);

      const oldIndex = driverAsgs.findIndex((x) => x.id === a.id);
      let newIndex = oldIndex;
      if (overParsed?.kind === "assignment") {
        newIndex = driverAsgs.findIndex((x) => x.id === overParsed.id);
      } else {
        newIndex = driverAsgs.length - 1;
      }

      if (newIndex < 0) newIndex = driverAsgs.length - 1;
      if (oldIndex === newIndex) return;

      const reordered = arrayMove(driverAsgs, oldIndex, newIndex);
      reordered.forEach((x, i) => { x.sequence = i + 1; });

      const finalAssignments = newAssignments.map(x => {
        if (x.driver_id === targetDriver) {
          return reordered.find(r => r.id === x.id)!;
        }
        return x;
      });
      setLocalAssignments(finalAssignments);
      return;
    }

    // 跨司机移动
    newAssignments.splice(aIndex, 1);
    const oldDriverAsgs = newAssignments.filter(x => x.driver_id === a.driver_id).sort((x, y) => x.sequence - y.sequence);
    oldDriverAsgs.forEach((x, i) => x.sequence = i + 1);

    a.driver_id = targetDriver;
    a.vehicle_id = getDriverVehicle(targetDriver);

    const targetDriverAsgs = newAssignments.filter(x => x.driver_id === targetDriver).sort((x, y) => x.sequence - y.sequence);
    let insertIndex = targetDriverAsgs.length;
    if (overParsed && overParsed.kind === "assignment") {
      insertIndex = targetDriverAsgs.findIndex(x => x.id === overParsed.id);
      if (insertIndex < 0) insertIndex = targetDriverAsgs.length;
    }

    targetDriverAsgs.splice(insertIndex, 0, a);
    targetDriverAsgs.forEach((x, i) => x.sequence = i + 1);

    setLocalAssignments(newAssignments);
  };

  const activeCard = activeId ? cardId.parse(activeId) : null;
  const activeOrder =
    activeCard?.kind === "order"
      ? orders.find((o) => o.id === activeCard.id)
      : activeCard?.kind === "assignment"
        ? currentAssignments.find((a) => a.id === activeCard.id)?.orders
        : undefined;

  // ============ Render ============
  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-4 h-screen flex flex-col">
        <div className="flex items-center justify-between mb-4 gap-4">
          <h1 className="text-2xl font-bold">排班看板</h1>
          <div className="flex items-center gap-3">
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
          <div className="flex-1 flex overflow-hidden border-t">
            {/* 左侧:待排班 */}
            <div className="h-full shrink-0 pr-3 border-r overflow-y-auto pt-2">
              <BacklogColumn orders={unassigned} completedOrders={completedOrders} />
            </div>

            {/* 右侧:司机行 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/10">
              {drivers.map((d) => {
                const list = activeAssignments.filter((a) => a.driver_id === d.id)
                  .sort((x, y) => x.sequence - y.sequence);
                const driverSteps = jobSteps.filter(s => s.driver_id === d.id);

                // 检查该司机是否有未保存的更改
                const driverServer = assignments.filter(a => a.driver_id === d.id);
                const hasChanges = localAssignments !== null && (
                  list.length !== driverServer.length ||
                  list.some((l) => {
                    const s = driverServer.find(x => x.id === l.id);
                    return !s || s.sequence !== l.sequence || s.vehicle_id !== l.vehicle_id || s.driver_id !== l.driver_id;
                  })
                );

                return (
                  <DriverColumn
                    key={d.id}
                    driver={d}
                    vehicle={getVehicle(d.id)}
                    vehicles={vehicles}
                    onChangeVehicle={(v) => {
                      setDriverVehicle((prev) => ({ ...prev, [d.id]: v }));
                      if (localAssignments) {
                        setLocalAssignments(localAssignments.map(a => a.driver_id === d.id ? { ...a, vehicle_id: v } : a));
                      }
                    }}
                    assignments={list}
                    jobSteps={driverSteps}
                    commonLocations={commonLocations}
                    bins={bins}
                    onCancel={(id) => {
                      const newAssignments = [...currentAssignments];
                      const idx = newAssignments.findIndex(x => x.id === id);
                      if (idx >= 0) {
                        newAssignments.splice(idx, 1);
                        setLocalAssignments(newAssignments);
                      }
                    }}
                    hasChanges={hasChanges}
                    onSave={() => saveAllChanges.mutate()}
                    isSaving={saveAllChanges.isPending}
                    onInsertStep={(params) => insertManualStep.mutate(params)}
                    onDeleteStep={(stepId) => deleteManualStep.mutate(stepId)}
                    insertStepAt={insertStepAt}
                    setInsertStepAt={setInsertStepAt}
                  />
                );
              })}
              {drivers.length === 0 && (
                <div className="text-center text-muted-foreground p-12 bg-card rounded-lg border border-dashed">
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

      </div>
    </TooltipProvider>
  );
}

// ============ Order Node Display ============
function OrderNodeDisplay({
  assignment, vehicle, onCancel
}: {
  assignment: Assignment;
  vehicle: Vehicle | undefined;
  onCancel: (id: string) => void;
}) {
  const order = assignment.orders;
  const tm = typeMeta(order.type);
  const conflict = vehicle ? !vehicleCanCarry(vehicle.type, order.bin_size) : false;
  
  // 桶类型中文映射
  const binTypeNames: Record<string, string> = {
    'garbage': '垃圾桶',
    'brick': '砖桶',
    'soil': '土桶',
    'cement': '水泥桶',
    'asphalt': '沥青桶'
  };
  const binTypeName = order.bin_type ? binTypeNames[order.bin_type] || order.bin_type : '';

  return (
    <div className="group relative rounded-lg border-l-4 border-l-blue-500 bg-card shadow-md p-3 transition-all duration-300 hover:shadow-xl hover:scale-105 hover:-translate-y-1 w-[220px] shrink-0">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={cn("text-[10px]", tm.className)}>{tm.label}</Badge>
          <span className="text-[11px] text-muted-foreground font-mono">
            {order.order_number}
          </span>
        </div>
        <div className="text-sm font-semibold">
          {tm.emoji} {tm.label} {order.bin_size ? `${order.bin_size}yd` : ""} {binTypeName}
        </div>
        <div className="text-xs text-muted-foreground truncate" title={order.address}>{order.address}</div>
        <div className="text-xs text-primary font-medium">{timeLabel(order)}</div>
        {order.customer_notes && (
          <div className="text-[10px] text-status-progress truncate">
            📝 {order.customer_notes}
          </div>
        )}
        {conflict && vehicle && (
          <div className="text-[10px] text-destructive font-bold flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {vehicle.type} 不支持 {order.bin_size}yd 桶
          </div>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="absolute top-2 right-2 text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs min-w-[120px]">
          <DropdownMenuItem onClick={() => alert(`订单号:${order.order_number}\n客户:${order.customer_name}\n地址:${order.address}`)}>
            查看详情
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCancel(assignment.id)} className="text-destructive">
            取消分配
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ============ Step Node Display ============
function StepNodeDisplay({
  step, onDelete
}: {
  step: JobStep;
  onDelete: (id: string) => void;
}) {
  const stepTypeLabels: Record<string, string> = {
    'pickup_bin': '取桶',
    'drop_bin': '放桶',
    'dump_waste': '倒垃圾',
    'load_material': '装料',
    'unload_material': '卸料',
  };
  const stepLabel = stepTypeLabels[step.step_type] || step.step_type;

  return (
    <div className="group relative rounded-lg border-l-4 border-l-gray-400 bg-card/80 shadow-sm p-2 transition-all duration-300 hover:shadow-lg hover:scale-105 hover:-translate-y-1 w-[180px] shrink-0">
      <div className="flex flex-col gap-1.5">
        <Badge variant="outline" className="text-[9px] w-fit">手动步骤</Badge>
        <div className="text-xs font-semibold">
          {stepLabel}
        </div>
        <div className="text-[10px] text-muted-foreground truncate" title={step.location}>
          <MapPin className="h-2.5 w-2.5 inline mr-1" />
          {step.location}
        </div>
        {step.bin_id && (
          <div className="text-[10px] text-primary">桶号: {step.bin_id}</div>
        )}
        {step.notes && (
          <div className="text-[9px] text-muted-foreground truncate">
            📝 {step.notes}
          </div>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="absolute top-1.5 right-1.5 text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs min-w-[120px]">
          <DropdownMenuItem onClick={() => onDelete(step.id)} className="text-destructive">
            删除步骤
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ============ Insert Step Button ============
function InsertStepButton({
  driverId, position, isActive, onClick, onClose, onInsert, commonLocations, bins
}: {
  driverId: string;
  position: number;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
  onInsert: (params: { driverId: string; position: number; location: string; stepType: string; binId?: string; notes?: string }) => void;
  commonLocations: CommonLocation[];
  bins: Bin[];
}) {
  const [location, setLocation] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [stepType, setStepType] = useState("");
  const [binId, setBinId] = useState("");
  const [notes, setNotes] = useState("");
  const [showCustomLocation, setShowCustomLocation] = useState(false);

  const handleInsert = () => {
    const finalLocation = showCustomLocation ? customLocation : location;
    if (!finalLocation || !stepType) {
      toast.error("请填写地点和动作");
      return;
    }
    onInsert({ driverId, position, location: finalLocation, stepType, binId, notes });
    // 重置表单
    setLocation("");
    setCustomLocation("");
    setStepType("");
    setBinId("");
    setNotes("");
    setShowCustomLocation(false);
  };

  return (
    <div className="w-full p-3 border-2 border-primary rounded-lg bg-card shadow-lg space-y-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-primary">✨ 插入步骤</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          ✕
        </button>
      </div>
      
      {!showCustomLocation ? (
        <div>
          <Label className="text-xs font-medium">📍 地点</Label>
          <Select value={location} onValueChange={(v) => {
            if (v === "custom") {
              setShowCustomLocation(true);
              setLocation("");
            } else {
              setLocation(v);
            }
          }}>
            <SelectTrigger className="mt-1 h-8 text-xs">
              <SelectValue placeholder="选择常用地点" />
            </SelectTrigger>
            <SelectContent>
              {commonLocations.map((loc) => (
                <SelectItem key={loc.id} value={loc.address} className="text-xs">
                  {loc.name} - {loc.address}
                </SelectItem>
              ))}
              <SelectItem value="custom" className="text-xs text-primary font-medium">
                + 手动输入地址
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div>
          <Label className="text-xs font-medium">📍 自定义地址</Label>
          <div className="flex gap-1 mt-1">
            <input
              type="text"
              value={customLocation}
              onChange={(e) => setCustomLocation(e.target.value)}
              placeholder="输入地址"
              className="flex-1 h-8 px-2 rounded-md border bg-background text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowCustomLocation(false);
                setCustomLocation("");
              }}
              className="h-8 px-2 text-xs"
            >
              取消
            </Button>
          </div>
        </div>
      )}
      
      <div>
        <Label className="text-xs font-medium">⚡ 动作</Label>
        <Select value={stepType} onValueChange={setStepType}>
          <SelectTrigger className="mt-1 h-8 text-xs">
            <SelectValue placeholder="选择动作" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pickup_bin" className="text-xs">🔼 取桶</SelectItem>
            <SelectItem value="drop_bin" className="text-xs">🔽 放桶</SelectItem>
            <SelectItem value="dump_waste" className="text-xs">🗑️ 倒垃圾</SelectItem>
            <SelectItem value="load_material" className="text-xs">📦 装料</SelectItem>
            <SelectItem value="unload_material" className="text-xs">📤 卸料</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label className="text-xs font-medium">🪣 桶号 (可选)</Label>
        <Select value={binId || "none"} onValueChange={(v) => setBinId(v === "none" ? "" : v)}>
          <SelectTrigger className="mt-1 h-8 text-xs">
            <SelectValue placeholder="不指定" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-xs">不指定</SelectItem>
            {bins.map((bin) => (
              <SelectItem key={bin.id} value={bin.id} className="text-xs">
                {bin.bin_number} ({bin.size}yd)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label className="text-xs font-medium">📝 备注 (可选)</Label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="备注信息"
          className="w-full h-8 px-2 rounded-md border bg-background text-xs mt-1"
        />
      </div>
      
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleInsert} className="flex-1 h-8 text-xs font-medium">
          ✓ 确认插入
        </Button>
        <Button size="sm" variant="outline" onClick={onClose} className="h-8 text-xs">
          取消
        </Button>
      </div>
    </div>
  );
}

// ============ Backlog Column ============
function BacklogColumn({ orders, completedOrders }: { orders: Order[], completedOrders: Order[] }) {
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
  }, [orders, timeFilter]);

  return (
    <div className="w-[260px] flex flex-col h-full bg-muted/30 rounded-lg">
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
          "flex-1 overflow-y-auto p-2 space-y-2 transition-colors",
          isOver && "bg-primary/5"
        )}
      >
        <SortableContext
          items={filteredOrders.map((o) => cardId.fromOrder(o.id))}
          strategy={verticalListSortingStrategy}
        >
          {filteredOrders.map((o) => (
            <SortableOrderCard key={o.id} id={cardId.fromOrder(o.id)}>
              <OrderCardDisplay order={o} binNumber={null} />
            </SortableOrderCard>
          ))}
        </SortableContext>
        {filteredOrders.length === 0 && orders.length > 0 && (
          <div className="text-center text-muted-foreground text-[11px] py-6">
            {timeFilter === 'AM' ? '无 AM 订单' : timeFilter === 'PM' ? '无 PM 订单' : '全部已排班 🎉'}
          </div>
        )}
        {orders.length === 0 && (
          <div className="text-center text-muted-foreground text-[11px] py-6">
            全部已排班 🎉
          </div>
        )}
      </div>

      {/* 已完成区域 */}
      {completedOrders.length > 0 && (
        <div className="border-t bg-card/50 rounded-b-lg flex flex-col max-h-[150px]">
          <div className="px-3 py-1.5 border-b flex items-center justify-between bg-status-done/10">
            <div className="text-[11px] font-bold text-status-done flex items-center gap-1">
              ✓ 已完成
            </div>
            <Badge variant="outline" className="text-[9px] h-4 px-1">{completedOrders.length}</Badge>
          </div>
          <div className="overflow-y-auto p-1.5 space-y-1.5">
            {completedOrders.map((o) => (
              <OrderCardDisplay key={o.id} order={o} binNumber={null} readonly />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ Driver Column ============
function DriverColumn({
  driver, vehicle, vehicles, onChangeVehicle, assignments, jobSteps, commonLocations, bins, onCancel, hasChanges, onSave, isSaving, onInsertStep, onDeleteStep, insertStepAt, setInsertStepAt
}: {
  driver: Profile;
  vehicle: Vehicle | undefined;
  vehicles: Vehicle[];
  onChangeVehicle: (id: string) => void;
  assignments: Assignment[];
  jobSteps: JobStep[];
  commonLocations: CommonLocation[];
  bins: Bin[];
  onCancel: (id: string) => void;
  hasChanges?: boolean;
  onSave?: () => void;
  isSaving?: boolean;
  onInsertStep: (params: { driverId: string; position: number; location: string; stepType: string; binId?: string; notes?: string }) => void;
  onDeleteStep: (stepId: string) => void;
  insertStepAt: { driverId: string; position: number } | null;
  setInsertStepAt: (value: { driverId: string; position: number } | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: driver.id });
  
  // 合并订单节点和步骤节点，按 step_number 排序
  const allNodes = useMemo(() => {
    const nodes: Array<{ type: 'order' | 'step'; data: Assignment | JobStep; stepNumber: number }> = [];
    
    // 添加订单节点（从 assignments）
    // 每个 assignment 对应一个或多个 job_steps
    assignments.forEach(a => {
      // 查找这个 assignment 对应的 job_steps
      const assignmentSteps = jobSteps.filter(s => s.assignment_id === a.id);
      
      if (assignmentSteps.length > 0) {
        // 使用第一个 step 的 step_number（通常一个 assignment 只有一个主步骤）
        const mainStep = assignmentSteps[0];
        nodes.push({ type: 'order', data: a, stepNumber: mainStep.step_number });
      } else {
        // 如果没有对应的 job_steps，使用 sequence 作为 stepNumber
        nodes.push({ type: 'order', data: a, stepNumber: a.sequence });
      }
    });
    
    // 添加步骤节点（从 jobSteps，node_type === 'step'）
    jobSteps.filter(s => s.node_type === 'step').forEach(s => {
      nodes.push({ type: 'step', data: s, stepNumber: s.step_number });
    });
    
    return nodes.sort((a, b) => a.stepNumber - b.stepNumber);
  }, [assignments, jobSteps]);

  return (
    <div className="bg-card border rounded-lg shadow-sm flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center justify-between">
        <div className="font-semibold text-base tracking-tight flex items-center gap-2">
          <span>👤</span> {driver.name}
          <Badge variant="secondary" className="px-2 text-[11px] font-normal">{allNodes.length} 步骤</Badge>
        </div>
        <div className="flex items-center gap-3">
          <Select value={vehicle?.id ?? ""} onValueChange={onChangeVehicle}>
            <SelectTrigger className="h-7 w-[160px] text-xs bg-background">
              <SelectValue placeholder="选择车辆" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id} className="text-xs">
                  {v.name} · {v.type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasChanges && (
            <Button size="sm" onClick={onSave} disabled={isSaving} className="h-7 text-xs px-3 shadow-sm font-bold">
              同步修改
            </Button>
          )}
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "p-3 flex flex-row gap-3 overflow-x-auto min-h-[160px] transition-colors group custom-scrollbar",
          isOver ? "bg-primary/5" : "bg-muted/5"
        )}
      >
        {/* 顶部插入按钮 - 只在悬停时显示 */}
        <div className="relative shrink-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          {insertStepAt?.driverId === driver.id && insertStepAt?.position === 0 ? (
            <div className="w-[240px]">
              <InsertStepButton
                driverId={driver.id}
                position={0}
                isActive={true}
                onClick={() => {}}
                onClose={() => setInsertStepAt(null)}
                onInsert={onInsertStep}
                commonLocations={commonLocations}
                bins={bins}
              />
            </div>
          ) : (
            <button
              onClick={() => setInsertStepAt({ driverId: driver.id, position: 0 })}
              className="w-10 h-10 rounded-full border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/10 transition-all flex items-center justify-center text-primary"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
        
        {allNodes.map((node, index) => (
          <div key={node.type === 'order' ? (node.data as Assignment).id : (node.data as JobStep).id} className="flex items-center gap-3 shrink-0">
            {node.type === 'order' ? (
              <OrderNodeDisplay
                assignment={node.data as Assignment}
                vehicle={vehicle}
                onCancel={onCancel}
              />
            ) : (
              <StepNodeDisplay
                step={node.data as JobStep}
                onDelete={onDeleteStep}
              />
            )}
            
            {/* 节点之间的插入按钮 - 只在悬停时显示 */}
            <div className="relative shrink-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
              {insertStepAt?.driverId === driver.id && insertStepAt?.position === node.stepNumber + 1 ? (
                <div className="w-[240px]">
                  <InsertStepButton
                    driverId={driver.id}
                    position={node.stepNumber + 1}
                    isActive={true}
                    onClick={() => {}}
                    onClose={() => setInsertStepAt(null)}
                    onInsert={onInsertStep}
                    commonLocations={commonLocations}
                    bins={bins}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setInsertStepAt({ driverId: driver.id, position: node.stepNumber + 1 })}
                  className="w-10 h-10 rounded-full border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/10 transition-all flex items-center justify-center text-primary"
                >
                  <Plus className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        ))}
        
        {allNodes.length === 0 && (
          <div className="w-full self-center text-center text-xs text-muted-foreground/50 py-4">
            拖拽任务至此处或点击 + 插入步骤
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
  order, binNumber, conflict, conflictLabel, onCancel, ghost, readonly, isRowLayout
}: {
  order: Order;
  binNumber: string | null;
  conflict?: boolean;
  conflictLabel?: string;
  onCancel?: () => void;
  ghost?: boolean;
  readonly?: boolean;
  isRowLayout?: boolean;
}) {
  const tm = typeMeta(order.type);
  const isDone = order.status === "done";

  return (
    <div
      className={cn(
        "relative rounded border bg-card shadow-sm p-1.5 transition-colors shrink-0",
        !readonly ? "cursor-grab active:cursor-grabbing hover:border-primary/40" : "",
        isRowLayout ? "w-[180px]" : "w-full",
        conflict && "ring-1 ring-destructive border-destructive",
        ghost && "shadow-xl opacity-90 scale-105",
        isDone && "bg-muted/50 border-transparent opacity-80"
      )}
    >
      <div className={cn("absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full", `bg-type-${order.type}`)} />
      <div className="pl-1.5 flex flex-col gap-1 w-full min-w-0">

        {/* 行 1: 时间 */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-primary">{timeLabel(order)}</span>
          {onCancel && !readonly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-muted-foreground/50 hover:text-foreground">
                  <MoreVertical className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs min-w-[120px]">
                <DropdownMenuItem onClick={() => alert(`订单号:${order.order_number}\n客户:${order.customer_name}\n地址:${order.address}`)}>
                  查看详情
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onCancel} className="text-destructive">
                  取消分配
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* 行 2: 做什么 */}
        <div className="flex items-center gap-1 text-[11px] font-semibold truncate">
          <span>{tm.emoji} {tm.label} {order.bin_size ? `${order.bin_size}y` : ""}</span>
          {binNumber && <Badge className="ml-auto h-3.5 px-1 text-[9px] bg-primary/10 text-primary border-primary/20">#{binNumber}</Badge>}
        </div>

        {/* 行 3: 地址 */}
        <div className="text-[10px] text-muted-foreground truncate" title={order.address}>
          {order.address}
        </div>

        {/* 行 4: 备注/冲突 */}
        {conflict ? (
          <div className="text-[9px] text-destructive font-bold truncate flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5" /> {conflictLabel}
          </div>
        ) : order.customer_notes && !isDone ? (
          <div className="text-[9px] text-status-progress truncate opacity-80">
            📝 {order.customer_notes}
          </div>
        ) : <div className="h-3.5"></div>}
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
