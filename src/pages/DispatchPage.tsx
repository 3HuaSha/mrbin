import { useMemo, useState, useRef, useCallback, useEffect } from "react";
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
  ChevronLeft, ChevronRight, AlertTriangle, MoreVertical, Plus, MapPin, CheckCircle2, Camera, Image as ImageIcon,
} from "lucide-react";
import {
  todayISO, typeMeta, vehicleCanCarry, ORDER_STATUS_LABEL,
} from "@/lib/business";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DndContext, type DragEndEvent, type DragStartEvent, PointerSensor,
  useSensor, useSensors, DragOverlay, useDroppable, pointerWithin, rectIntersection, closestCenter,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, horizontalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAudit } from "@/hooks/use-audit";
import { DispatchMapWidget } from "@/components/DispatchMapWidget";
import { BusinessTypeSelector } from "@/components/BusinessTypeSelector";
import { useBusinessType } from "@/lib/business-type-storage";
import type { BusinessType } from "@/lib/business";

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
  photo_url: string | null;
  bin_number_reported: string | null;
  old_bin_number_reported: string | null;
  weigh_ticket_url: string | null;
  weight_kg: number | null;
  dump_site: string | null;
  completed_at: string | null;
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

// 自定义碰撞检测：优先用 pointerWithin 检测容器，回退到 closestCenter
const multiContainerCollision: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return closestCenter(args);
};

export function DispatchPage() {
  const qc = useQueryClient();
  const audit = useAudit();
  const [date, setDate] = useState(todayISO());
  const [businessType, setBusinessType] = useBusinessType();
  const [localAssignments, setLocalAssignments] = useState<Assignment[] | null>(null);
  const [localJobSteps, setLocalJobSteps] = useState<JobStep[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [insertStepAt, setInsertStepAt] = useState<{ driverId: string; position: number; adjacentOrderId?: string; adjacentOrderType?: string } | null>(null);
  const [viewingStep, setViewingStep] = useState<JobStep | null>(null);
  const [linkingStepId, setLinkingStepId] = useState<string | null>(null);

  // Supabase Realtime: 监听 job_steps 和 orders 表变化，实时刷新（无需轮询）
  useEffect(() => {
    const channel = supabase.channel('dispatch-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_steps' }, () => {
        qc.invalidateQueries({ queryKey: ["job-steps", date] });
        qc.invalidateQueries({ queryKey: ["dispatch-assignments", date] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: ["dispatch-orders", date] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [date, qc]);

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers-assigned"],
    queryFn: async () => {
      // 获取已分配车辆的司机 ID
      const { data: assignments } = await supabase
        .from("driver_vehicle_assignments")
        .select("driver_id");
      const assignedIds = (assignments || []).map(a => a.driver_id);

      const { data, error } = await supabase.from("profiles")
        .select("id,name")
        .eq("role", "driver")
        .eq("is_active", true)
        .in("id", assignedIds.length > 0 ? assignedIds : ["none"])
        .order("name");
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

  const { data: vehicleAssignments = [] } = useQuery({
    queryKey: ["driver-vehicle-assignments-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_vehicle_assignments")
        .select("*, vehicles(*)");
      if (error) throw error;
      return data || [];
    },
  });

  // 根据业务类型过滤司机
  const filteredDrivers = useMemo(() => {
    return drivers.filter(d => {
      const assignment = vehicleAssignments.find((a: any) => a.driver_id === d.id);
      if (!assignment) return false;
      const vName = (assignment.vehicles?.name || "").toUpperCase();
      if (businessType === 'garbage') return vName.startsWith('BIN');
      if (businessType === 'brick') return vName.startsWith('FLAT');
      return true;
    });
  }, [drivers, vehicleAssignments, businessType]);

  // 根据业务类型过滤车辆
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      const vName = (v.name || "").toUpperCase();
      if (businessType === 'garbage') return vName.startsWith('BIN');
      if (businessType === 'brick') return vName.startsWith('FLAT');
      return true;
    });
  }, [vehicles, businessType]);
  const { data: bins = [] } = useQuery({
    queryKey: ["bins-depot"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bins")
        .select("*").eq("status", "depot").eq("is_active", true).order("bin_number");
      if (error) throw error;
      return data as Bin[];
    },
  });
  const { data: ordersData } = useQuery({
    queryKey: ["dispatch-orders", date, businessType],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*")
        .eq("service_date", date)
        .eq("business_type", businessType)
        .neq("status", "cancelled").order("created_at");
      if (error) throw error;
      // 排班侧隐藏换桶自动生成的 pickup 子单:
      // 有 linked_order_id 的 pickup 属于某条 swap 订单,不单独出现
      const mainIds = new Set((data ?? []).filter((o: any) => o.type === "swap").map((o: any) => o.id));
      // 建立 swap → pickup 映射: 换桶订单的倒垃圾应关联其子收桶单
      const swapToPickup: Record<string, string> = {};
      (data ?? []).forEach((o: any) => {
        if (o.type === "pickup" && o.linked_order_id && mainIds.has(o.linked_order_id)) {
          swapToPickup[o.linked_order_id] = o.id;
        }
      });
      const filtered = (data ?? []).filter((o: any) => {
        if (o.type === "pickup" && o.linked_order_id && mainIds.has(o.linked_order_id)) return false;
        return true;
      }) as Order[];
      return { orders: filtered, swapToPickup };
    },
  });
  const orders = ordersData?.orders ?? [];
  const swapToPickup = ordersData?.swapToPickup ?? {};
  const { data: assignments = [] } = useQuery({
    queryKey: ["dispatch-assignments", date, businessType],
    queryFn: async () => {
      const { data, error } = await supabase.from("dispatch_assignments")
        .select("*, orders(*), vehicles(*), bins(*)")
        .eq("scheduled_date", date).order("sequence");
      if (error) throw error;
      
      // 过滤出匹配业务类型的 assignments
      const filtered = (data ?? []).filter(a => 
        (a.orders as any)?.business_type === businessType
      );
      
      return filtered as unknown as Assignment[];
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
  const currentJobSteps = localJobSteps ?? jobSteps;

  // 区分已完成和未完成的订单
  const completedOrders = useMemo(() => orders.filter(o => o.status === "done"), [orders]);
  const activeOrders = useMemo(() => orders.filter(o => o.status !== "done"), [orders]);

  // 所有 assignments 都在司机列显示（已完成的会有绿色标记）
  const activeAssignments = currentAssignments;

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
    // 优先使用车队页面已分配的车辆
    const fleetAssignment = vehicleAssignments.find((a: any) => a.driver_id === driverId);
    if (fleetAssignment?.vehicle_id) return fleetAssignment.vehicle_id;
    const fromAssignment = currentAssignments.find((a) => a.driver_id === driverId)?.vehicle_id;
    return fromAssignment ?? filteredVehicles[0]?.id ?? "";
  };
  const getVehicle = (driverId: string) =>
    filteredVehicles.find((v) => v.id === getDriverVehicle(driverId)) || vehicles.find(v => v.id === getDriverVehicle(driverId));

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
        // 注：DB 触发器已禁用，前端负责创建完整步骤链
        const order = i.orders;
        const displayStep = {
          assignment_id: newAssignment.id,
          driver_id: i.driver_id,
          scheduled_date: i.scheduled_date,
          order_id: order.id,
          node_type: 'order' as const,
          step_number: i.sequence,
          step_type: order.type === "delivery" ? "delivery" : order.type === "pickup" ? "pickup" : "swap",
          location: order.address,
          status: 'locked',
        };
        const workflowSteps: any[] = [];
        
        if (order.type === "delivery") {
          workflowSteps.push(
            { assignment_id: newAssignment.id, step_number: 1, step_type: 'depot_pickup', location: 'Kennedy Depot, 3445 Kennedy Rd', status: 'pending', requires_photo: true, requires_bin_number: true, driver_id: i.driver_id, scheduled_date: i.scheduled_date, order_id: order.id },
            { assignment_id: newAssignment.id, step_number: 2, step_type: 'customer_delivery', location: order.address, status: 'locked', requires_photo: true, requires_bin_number: true, driver_id: i.driver_id, scheduled_date: i.scheduled_date, order_id: order.id }
          );
        } else if (order.type === "pickup") {
          workflowSteps.push(
            { assignment_id: newAssignment.id, step_number: 1, step_type: 'customer_pickup', location: order.address, status: 'pending', requires_photo: true, requires_bin_number: true, driver_id: i.driver_id, scheduled_date: i.scheduled_date, order_id: order.id }
          );
        }
        
        // 插入显示节点 + 工作流步骤
        const allStepsToInsert = [displayStep, ...workflowSteps];
        if (allStepsToInsert.length > 0) {
          const { error: stepsError } = await supabase.from("job_steps").insert(allStepsToInsert);
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
          
          // 同时更新对应的 job_steps 的 driver_id
          await supabase.from("job_steps").update({
            driver_id: u.driver_id,
          }).eq("assignment_id", u.id);
          // 只更新 display 节点的 step_number（工作流步骤保持内部编号）
          await supabase.from("job_steps").update({
            step_number: u.sequence,
          }).eq("assignment_id", u.id).eq("node_type", "order");
        }
      }
      
      // 更新手动步骤的位置（如果有本地修改）
      if (localJobSteps) {
        for (const localStep of localJobSteps) {
          // 只处理手动步骤（node_type === 'step'）
          if (localStep.node_type === 'step' && !localStep.id.startsWith('temp-')) {
            const originalStep = jobSteps.find(s => s.id === localStep.id);
            // 如果 step_number、driver_id 或 location 发生变化，则更新
            if (originalStep && (originalStep.step_number !== localStep.step_number || originalStep.driver_id !== localStep.driver_id || originalStep.location !== localStep.location)) {
              await supabase.from("job_steps").update({
                step_number: localStep.step_number,
                driver_id: localStep.driver_id,
                location: localStep.location,
              }).eq("id", localStep.id);
            }
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("已保存并同步给相关司机");
      setLocalAssignments(null);
      setLocalJobSteps(null);
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
      orderId?: string;
    }) => {
      const { driverId, position, location, stepType, binId, notes, orderId } = params;
      
      // 获取该司机当天的所有步骤
      const driverSteps = currentJobSteps.filter(
        s => s.driver_id === driverId && s.scheduled_date === date
      ).sort((a, b) => a.step_number - b.step_number);
      
      // 插入新步骤到数据库
      const { data, error } = await supabase.from("job_steps").insert({
        driver_id: driverId,
        scheduled_date: date,
        step_number: position,
        node_type: 'step',
        location,
        step_type: stepType,
        bin_id: binId || null,
        notes: notes || null,
        order_id: orderId || null,
        status: 'locked',
      }).select().single();
      
      if (error) throw error;
      
      // 更新后续步骤的编号
      const stepsToUpdate = driverSteps.filter(s => s.step_number >= position);
      for (const step of stepsToUpdate) {
        await supabase.from("job_steps")
          .update({ step_number: step.step_number + 1 })
          .eq("id", step.id);
      }
      
      return { newStep: data as JobStep, stepsToUpdate };
    },
    onSuccess: (result) => {
      const { newStep, stepsToUpdate } = result;
      
      // 立即更新本地状态
      const updatedSteps = [...currentJobSteps];
      
      // 添加新步骤
      updatedSteps.push(newStep);
      
      // 更新后续步骤的编号
      stepsToUpdate.forEach(oldStep => {
        const index = updatedSteps.findIndex(s => s.id === oldStep.id);
        if (index >= 0) {
          updatedSteps[index] = { ...updatedSteps[index], step_number: oldStep.step_number + 1 };
        }
      });
      
      setLocalJobSteps(updatedSteps);
      
      toast.success("已插入步骤");
      setInsertStepAt(null);
      qc.invalidateQueries({ queryKey: ["job-steps", date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteManualStep = useMutation({
    mutationFn: async (stepId: string) => {
      const step = currentJobSteps.find(s => s.id === stepId);
      if (!step) throw new Error("步骤不存在");
      
      // 删除步骤
      const { error } = await supabase.from("job_steps").delete().eq("id", stepId);
      if (error) throw error;
      
      // 更新后续步骤的编号
      const laterSteps = currentJobSteps.filter(
        s => s.driver_id === step.driver_id && 
             s.scheduled_date === step.scheduled_date && 
             s.step_number > step.step_number
      );
      
      for (const laterStep of laterSteps) {
        await supabase.from("job_steps")
          .update({ step_number: laterStep.step_number - 1 })
          .eq("id", laterStep.id);
      }
      
      return { deletedStep: step, laterSteps };
    },
    onSuccess: (result) => {
      const { deletedStep, laterSteps } = result;
      
      // 立即更新本地状态
      let updatedSteps = currentJobSteps.filter(s => s.id !== deletedStep.id);
      
      // 更新后续步骤的编号
      updatedSteps = updatedSteps.map(s => {
        if (laterSteps.some(ls => ls.id === s.id)) {
          return { ...s, step_number: s.step_number - 1 };
        }
        return s;
      });
      
      setLocalJobSteps(updatedSteps);
      
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

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    console.log('🔍 拖拽结束:', { activeIdStr, overIdStr, BACKLOG_ID });

    // ============ 处理手动步骤拖到待排班区域（删除步骤）============
    if (activeIdStr.startsWith('step:') && (overIdStr === BACKLOG_ID || overIdStr.startsWith('o:'))) {
      const stepId = activeIdStr.slice(5);
      const step = currentJobSteps.find(s => s.id === stepId);
      
      console.log('🗑️ 检测到手动步骤拖到待排班:', { stepId, step, nodeType: step?.node_type });
      
      if (step && step.node_type === 'step') {
        console.log('✅ 确认删除手动步骤:', stepId);
        deleteManualStep.mutate(stepId);
        return;
      } else {
        console.log('❌ 不是手动步骤，跳过删除');
      }
    }

    // 处理司机行内的拖拽排序
    if (activeIdStr.startsWith('a:') || activeIdStr.startsWith('step:')) {
      if (overIdStr.startsWith('a:') || overIdStr.startsWith('step:')) {
        console.log('司机行内拖拽');
        // 同一司机行内拖拽
        let activeAssignment: Assignment | undefined;
        let activeStep: JobStep | undefined;
        let overAssignment: Assignment | undefined;
        let overStep: JobStep | undefined;
        
        if (activeIdStr.startsWith('a:')) {
          const assignmentId = activeIdStr.slice(2);
          activeAssignment = currentAssignments.find(a => a.id === assignmentId);
        } else {
          const stepId = activeIdStr.slice(5);
          activeStep = currentJobSteps.find(s => s.id === stepId);
        }
        
        if (overIdStr.startsWith('a:')) {
          const assignmentId = overIdStr.slice(2);
          overAssignment = currentAssignments.find(a => a.id === assignmentId);
        } else {
          const stepId = overIdStr.slice(5);
          overStep = currentJobSteps.find(s => s.id === stepId);
        }
        
        console.log('找到的项:', { activeAssignment, activeStep, overAssignment, overStep });
        
        if (!activeAssignment && !activeStep) {
          console.log('未找到拖拽项');
          return;
        }
        if (!overAssignment && !overStep) {
          console.log('未找到目标项');
          return;
        }
        
        // 获取司机 ID
        const activeDriverId = activeAssignment?.driver_id || activeStep?.driver_id;
        const overDriverId = overAssignment?.driver_id || overStep?.driver_id;
        
        console.log('司机ID:', { activeDriverId, overDriverId });
        
        // 跨司机移动（从一行拖到另一行）
        if (activeDriverId !== overDriverId) {
          console.log('跨司机拖拽移动');
          if (!activeDriverId || !overDriverId) return;
          
          const newAssignments = [...currentAssignments];
          const newSteps = [...currentJobSteps];
          
          if (activeAssignment) {
            // 从原司机移除
            const aIdx = newAssignments.findIndex(x => x.id === activeAssignment!.id);
            if (aIdx >= 0) {
              newAssignments.splice(aIdx, 1);
              // 重排原司机的序号
              const oldDriverAsgs = newAssignments.filter(x => x.driver_id === activeDriverId).sort((a, b) => a.sequence - b.sequence);
              oldDriverAsgs.forEach((x, i) => { x.sequence = i + 1; });
              
              // 更新 driver_id 和 vehicle_id
              activeAssignment.driver_id = overDriverId;
              activeAssignment.vehicle_id = getDriverVehicle(overDriverId);
              
              // 插入到目标司机
              const targetAsgs = newAssignments.filter(x => x.driver_id === overDriverId).sort((a, b) => a.sequence - b.sequence);
              let insertIdx = targetAsgs.length;
              if (overAssignment) {
                insertIdx = targetAsgs.findIndex(x => x.id === overAssignment!.id);
                if (insertIdx < 0) insertIdx = targetAsgs.length;
              }
              targetAsgs.splice(insertIdx, 0, activeAssignment);
              targetAsgs.forEach((x, i) => { x.sequence = i + 1; });
              
              const finalAssignments = newAssignments.filter(x => x.driver_id !== overDriverId).concat(targetAsgs);
              setLocalAssignments(finalAssignments);
              
              // 更新对应的 job_steps 的 driver_id
              const updatedSteps = newSteps.map(s => {
                if (s.assignment_id === activeAssignment!.id) {
                  return { ...s, driver_id: overDriverId };
                }
                return s;
              });
              setLocalJobSteps(updatedSteps);
            }
          } else if (activeStep && activeStep.node_type === 'step') {
            // 手动步骤跨司机移动
            const sIdx = newSteps.findIndex(s => s.id === activeStep!.id);
            if (sIdx >= 0) {
              newSteps[sIdx] = { ...newSteps[sIdx], driver_id: overDriverId };
              setLocalJobSteps(newSteps);
            }
          }
          return;
        }
        if (!activeDriverId) {
          console.log('无司机ID');
          return;
        }
        
        // 获取该司机的所有 assignments 和 steps
        const driverAssignments = currentAssignments.filter(a => a.driver_id === activeDriverId);
        const driverSteps = currentJobSteps.filter(s => s.driver_id === activeDriverId && s.node_type === 'step');
        
        console.log('司机的项:', { driverAssignments: driverAssignments.length, driverSteps: driverSteps.length });
        
        // 合并并排序
        type NodeItem = { type: 'assignment' | 'step'; data: Assignment | JobStep; stepNumber: number };
        const allItems: NodeItem[] = [];
        
        driverAssignments.forEach(a => {
          const assignmentSteps = currentJobSteps.filter(s => s.assignment_id === a.id);
          const stepNumber = assignmentSteps.length > 0 ? assignmentSteps[0].step_number : a.sequence;
          allItems.push({ type: 'assignment', data: a, stepNumber });
        });
        
        driverSteps.forEach(s => {
          allItems.push({ type: 'step', data: s, stepNumber: s.step_number });
        });
        
        allItems.sort((a, b) => a.stepNumber - b.stepNumber);
        
        console.log('所有项:', allItems.length);
        
        // 找到拖拽的项和目标项的索引
        const oldIndex = allItems.findIndex(item => {
          if (item.type === 'assignment') {
            return (item.data as Assignment).id === activeAssignment?.id;
          } else {
            return (item.data as JobStep).id === activeStep?.id;
          }
        });
        
        const newIndex = allItems.findIndex(item => {
          if (item.type === 'assignment') {
            return (item.data as Assignment).id === overAssignment?.id;
          } else {
            return (item.data as JobStep).id === overStep?.id;
          }
        });
        
        console.log('索引:', { oldIndex, newIndex });
        
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
          console.log('索引无效或相同');
          return;
        }
        
        // 重新排序
        const reordered = arrayMove(allItems, oldIndex, newIndex);
        
        console.log('重新排序完成');
        
        // 更新 sequence 和 step_number
        const newAssignments = [...currentAssignments];
        const newSteps = [...currentJobSteps];
        
        reordered.forEach((item, index) => {
          const newStepNumber = index + 1;
          if (item.type === 'assignment') {
            const assignment = item.data as Assignment;
            const aIndex = newAssignments.findIndex(a => a.id === assignment.id);
            if (aIndex >= 0) {
              newAssignments[aIndex] = { ...newAssignments[aIndex], sequence: newStepNumber };
            }
            // 更新对应的 job_steps
            const stepIndex = newSteps.findIndex(s => s.assignment_id === assignment.id);
            if (stepIndex >= 0) {
              newSteps[stepIndex] = { ...newSteps[stepIndex], step_number: newStepNumber };
            }
          } else {
            const step = item.data as JobStep;
            const sIndex = newSteps.findIndex(s => s.id === step.id);
            if (sIndex >= 0) {
              newSteps[sIndex] = { ...newSteps[sIndex], step_number: newStepNumber };
            }
          }
        });
        
        console.log('更新状态');
        setLocalAssignments(newAssignments);
        setLocalJobSteps(newSteps);
        return;
      }
    }

    console.log('使用原有拖拽逻辑');

    // 原有的拖拽逻辑（从待排班列拖到司机行）
    const card = cardId.parse(activeIdStr);
    if (!card) return;

    let targetColumnId: string | null = null;
    const overParsed = cardId.parse(overIdStr);
    if (overParsed) {
      if (overParsed.kind === "assignment") {
        const a = currentAssignments.find((x) => x.id === overParsed.id);
        if (a) targetColumnId = a.driver_id;
      } else {
        targetColumnId = BACKLOG_ID;
      }
    } else {
      if (overIdStr.startsWith('step:')) {
        const stepId = overIdStr.slice(5);
        const step = currentJobSteps.find((x) => x.id === stepId);
        if (step) targetColumnId = step.driver_id;
      } else {
        targetColumnId = overIdStr;
      }
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
      } else if (overIdStr.startsWith('step:')) {
        // Find approximate index to insert by looking at step order
        const stepId = overIdStr.slice(5);
        const step = currentJobSteps.find((x) => x.id === stepId);
        if (step) {
          // step.step_number gives the position among all items.
          // For simplicity, just insert at end or approximate index.
          insertIndex = Math.min(step.step_number, driverAsgs.length);
        }
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

    // 重建完整数组：移除目标司机旧数据，拼接更新后的目标司机数据（含被移动的卡片）
    const finalAssignments = newAssignments.filter(x => x.driver_id !== targetDriver).concat(targetDriverAsgs);
    setLocalAssignments(finalAssignments);
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
      <div className="p-3 h-screen flex flex-col">
        <div className="flex items-center justify-between mb-2 gap-4">
          <h1 className="text-2xl font-bold">排班看板</h1>
          <div className="flex items-center gap-3">
            <BusinessTypeSelector value={businessType} onChange={setBusinessType} />
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
          collisionDetection={multiContainerCollision}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="flex-1 flex overflow-hidden border-t">
            {/* 左侧:待排班 */}
            <div className="h-full shrink-0 pr-3 border-r overflow-y-auto pt-2">
              <BacklogColumn orders={unassigned} completedOrders={completedOrders} />
            </div>

            {/* 右侧:司机行 */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-muted/10">
              {filteredDrivers.map((d) => {
                const list = activeAssignments.filter((a) => a.driver_id === d.id)
                  .sort((x, y) => x.sequence - y.sequence);
                const driverSteps = currentJobSteps.filter(s => s.driver_id === d.id);

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
                    vehicles={filteredVehicles}
                    onChangeVehicle={(v) => {
                      setDriverVehicle((prev) => ({ ...prev, [d.id]: v }));
                      if (localAssignments) {
                        setLocalAssignments(localAssignments.map(a => a.driver_id === d.id ? { ...a, vehicle_id: v } : a));
                      }
                    }}
                    assignments={list}
                    allAssignments={currentAssignments}
                    jobSteps={driverSteps}
                    commonLocations={commonLocations}
                    bins={bins}
                    swapToPickup={swapToPickup}
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
                    onOpenLinkDialog={(stepId) => setLinkingStepId(stepId)}
                    insertStepAt={insertStepAt}
                    setInsertStepAt={setInsertStepAt}
                    onViewStep={(step) => setViewingStep(step)}
                  />
                );
              })}
              {filteredDrivers.length === 0 && (
                <div className="text-center text-muted-foreground p-12 bg-card rounded-lg border border-dashed">
                  当前业务下无活跃司机。
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

        {/* 步骤详情弹窗 */}
        {viewingStep && (
          <StepDetailDialog
            step={viewingStep}
            onClose={() => setViewingStep(null)}
          />
        )}

        {/* 关联订单弹窗 */}
        {linkingStepId && (
          <LinkOrderDialog
            stepId={linkingStepId}
            currentOrderId={currentJobSteps.find(s => s.id === linkingStepId)?.order_id ?? null}
            onSelect={async (orderId) => {
              await supabase.from("job_steps").update({ order_id: orderId }).eq("id", linkingStepId);
              const updated = currentJobSteps.map(s => s.id === linkingStepId ? { ...s, order_id: orderId } : s);
              setLocalJobSteps(updated);
              qc.invalidateQueries({ queryKey: ["job-steps", date] });
              setLinkingStepId(null);
              toast.success(orderId ? "已关联订单" : "已取消关联");
            }}
            onClose={() => setLinkingStepId(null)}
          />
        )}

      </div>
    </TooltipProvider>
  );
}

// ============ Order Node Display ============
function OrderNodeDisplay({
  assignment, vehicle, onCancel, jobStep, onClick
}: {
  assignment: Assignment;
  vehicle: Vehicle | undefined;
  onCancel: (id: string) => void;
  jobStep?: JobStep;
  onClick?: () => void;
}) {
  const order = assignment.orders;
  const tm = typeMeta(order.type);
  const conflict = vehicle ? !vehicleCanCarry(vehicle.type, order.bin_size) : false;
  const isDone = jobStep?.status === "done";
  
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
    <div 
      className={cn(
        "group relative rounded-lg border-l-4 shadow-sm p-2 transition-all duration-300 hover:shadow-lg hover:scale-105 hover:z-10 w-[160px] shrink-0",
        isDone 
          ? "border-l-green-600 bg-green-100" 
          : "border-l-blue-500 bg-card",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold leading-tight">
            {tm.emoji} {tm.label} {order.bin_size ? `${order.bin_size}yd` : ""} {binTypeName}
          </div>
          {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
        </div>
        <div className="text-[10px] text-muted-foreground leading-snug truncate" title={order.address}>
          {order.address}
        </div>
        <div className="text-[10px] text-primary font-medium">{timeLabel(order)}</div>
        {jobStep?.bin_number_reported && (
          <div className="text-[9px] text-primary">桶号: {jobStep.bin_number_reported}</div>
        )}
        {order.customer_notes && (
          <div className="text-[9px] text-status-progress truncate">
            📝 {order.customer_notes}
          </div>
        )}
        {conflict && vehicle && (
          <div className="text-[9px] text-destructive font-bold flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5" /> {vehicle.type} 不支持 {order.bin_size}yd 桶
          </div>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button 
            className="absolute top-1.5 right-1.5 text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs min-w-[120px]">
          {onClick && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(); }}>
              查看详情
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); alert(`订单号:${order.order_number}\n客户:${order.customer_name}\n地址:${order.address}`); }}>
            订单信息
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCancel(assignment.id); }} className="text-destructive">
            取消分配
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ============ Step Node Display ============
function StepNodeDisplay({
  step, onDelete, onClick, linkedOrderLabel, onOpenLinkDialog
}: {
  step: JobStep;
  onDelete: (id: string) => void;
  onClick?: () => void;
  linkedOrderLabel?: string;
  onOpenLinkDialog?: (stepId: string) => void;
}) {
  const stepTypeLabels: Record<string, string> = {
    'pickup_bin': '取桶',
    'drop_bin': '放桶',
    'dump_waste': '倒垃圾',
    'load_material': '装料',
    'unload_material': '卸料',
  };
  const stepLabel = stepTypeLabels[step.step_type] || step.step_type;
  const isDone = step.status === "done";
  const isDumpWaste = step.step_type === 'dump_waste';

  return (
    <div 
      className={cn(
        "group relative rounded-lg border-l-4 shadow-sm p-2 transition-all duration-300 hover:shadow-lg hover:scale-105 hover:z-10 w-[150px] shrink-0",
        isDone 
          ? "border-l-green-600 bg-green-100" 
          : isDumpWaste
            ? "border-l-amber-500 bg-amber-50"
            : "border-l-gray-400 bg-card/80",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className={cn("text-[8px] w-fit", isDumpWaste && "border-amber-400 text-amber-700")}>
            {isDumpWaste ? '🗑️ 倒垃圾' : '手动步骤'}
          </Badge>
          {isDone && <CheckCircle2 className="h-3 w-3 text-green-600" />}
        </div>
        <div className="text-[11px] font-semibold">
          {stepLabel}
        </div>
        <div className="text-[9px] text-muted-foreground leading-snug break-words" title={step.location}>
          <MapPin className="h-2 w-2 inline mr-0.5" />
          {step.location}
        </div>
        {isDumpWaste && linkedOrderLabel && (
          <div className="text-[8px] text-amber-700 bg-amber-100 rounded px-1 py-0.5 truncate" title={linkedOrderLabel}>
            🔗 {linkedOrderLabel}
          </div>
        )}
        {isDumpWaste && !linkedOrderLabel && (
          <div className="text-[8px] text-muted-foreground/60 italic">
            未关联订单
          </div>
        )}
        {step.bin_number_reported && (
          <div className="text-[9px] text-primary">桶: {step.bin_number_reported}</div>
        )}
        {step.notes && (
          <div className="text-[8px] text-muted-foreground truncate">
            📝 {step.notes}
          </div>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button 
            className="absolute top-1 right-1 text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs min-w-[140px]">
          {onClick && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(); }}>
              查看详情
            </DropdownMenuItem>
          )}
          {isDumpWaste && onOpenLinkDialog && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenLinkDialog(step.id); }}>
              🔗 关联订单…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(step.id); }} className="text-destructive">
            删除步骤
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ============ Insert Step Button ============
function InsertStepButton({
  driverId, position, isActive, onClick, onClose, onInsert, commonLocations, bins, adjacentOrderId, adjacentOrderType
}: {
  driverId: string;
  position: number;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
  onInsert: (params: { driverId: string; position: number; location: string; stepType: string; binId?: string; notes?: string; orderId?: string }) => void;
  commonLocations: CommonLocation[];
  bins: Bin[];
  adjacentOrderId?: string;
  adjacentOrderType?: string;
}) {
  const [stepType, setStepType] = useState("");
  const [location, setLocation] = useState("");
  const [binSize, setBinSize] = useState("");
  const [notes, setNotes] = useState("");

  // 根据动作类型获取可用地点
  const getLocationOptions = () => {
    if (stepType === "pickup_bin" || stepType === "drop_bin") {
      return [
        { value: "3445", label: "3445 Kennedy" },
        { value: "12441", label: "12441 Woodbine" }
      ];
    } else if (stepType === "dump_waste") {
      return [
        { value: "3445", label: "3445 Kennedy" },
        { value: "york1 300", label: "YORK1 Nugget (300)" },
        { value: "63A", label: "63A Medulla" },
        { value: "draglam", label: "Draglam Vaughan" },
        { value: "draglam brampton", label: "Draglam Brampton" },
        { value: "maple waste", label: "Maple Transfer" },
        { value: "york1 whitby", label: "YORK1 Whitby" }
      ];
    }
    return [];
  };

  const handleInsert = () => {
    if (!stepType) {
      toast.error("请选择动作");
      return;
    }
    if (!location) {
      toast.error("请选择地点");
      return;
    }
    if (stepType !== "dump_waste" && !binSize) {
      toast.error("请选择桶大小");
      return;
    }
    
    // 倒垃圾不需要桶大小，其他步骤将桶大小添加到备注中
    const finalNotes = stepType === "dump_waste"
      ? notes
      : (notes ? `${binSize}yd - ${notes}` : `${binSize}yd`);
    
    // 倒垃圾步骤自动关联相邻的收桶/换桶订单
    const linkedOrderId = (stepType === "dump_waste" && adjacentOrderId && (adjacentOrderType === 'pickup' || adjacentOrderType === 'swap'))
      ? adjacentOrderId
      : undefined;
    
    onInsert({ driverId, position, location, stepType, notes: finalNotes || undefined, orderId: linkedOrderId });
    
    // 重置表单
    setStepType("");
    setLocation("");
    setBinSize("");
    setNotes("");
  };

  // 当动作改变时，重置地点
  const handleStepTypeChange = (value: string) => {
    setStepType(value);
    setLocation(""); // 重置地点选择
  };

  if (!isActive) return null;

  const locationOptions = getLocationOptions();

  return (
    <div className="w-[200px] p-2.5 border-2 border-primary rounded-lg bg-card shadow-2xl space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-primary">插入步骤</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          ✕
        </button>
      </div>
      
      {/* 第一行：动作 */}
      <div>
        <Label className="text-[10px] font-medium">动作</Label>
        <Select value={stepType} onValueChange={handleStepTypeChange}>
          <SelectTrigger className="mt-0.5 h-7 text-[10px]">
            <SelectValue placeholder="选择动作" />
          </SelectTrigger>
          <SelectContent className="z-[110]">
            <SelectItem value="drop_bin" className="text-[10px]">放下桶</SelectItem>
            <SelectItem value="pickup_bin" className="text-[10px]">取走桶</SelectItem>
            <SelectItem value="dump_waste" className="text-[10px]">倒垃圾</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* 自动关联提示 */}
      {stepType === 'dump_waste' && adjacentOrderId && (adjacentOrderType === 'pickup' || adjacentOrderType === 'swap') && (
        <div className="text-[9px] text-amber-700 bg-amber-50 rounded px-1.5 py-1">
          🔗 将自动关联相邻的收桶订单
        </div>
      )}
      
      {/* 第二行：地点（根据动作显示不同选项）*/}
      {stepType && (
        <div>
          <Label className="text-[10px] font-medium">地点</Label>
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className="mt-0.5 h-7 text-[10px]">
              <SelectValue placeholder="选择地点" />
            </SelectTrigger>
            <SelectContent className="z-[110]">
              {locationOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-[10px]">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      
      {/* 第三行：桶大小（倒垃圾不需要选桶大小）*/}
      {stepType !== "dump_waste" && (
        <div>
          <Label className="text-[10px] font-medium">桶大小</Label>
          <Select value={binSize} onValueChange={setBinSize}>
            <SelectTrigger className="mt-0.5 h-7 text-[10px]">
              <SelectValue placeholder="选择桶大小" />
            </SelectTrigger>
            <SelectContent className="z-[110]">
              <SelectItem value="14" className="text-[10px]">14 yd</SelectItem>
              <SelectItem value="20" className="text-[10px]">20 yd</SelectItem>
              <SelectItem value="30" className="text-[10px]">30 yd</SelectItem>
              <SelectItem value="40" className="text-[10px]">40 yd</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      
      {/* 第四行：备注 */}
      <div>
        <Label className="text-[10px] font-medium">备注 (可选)</Label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="备注"
          className="w-full h-7 px-1.5 rounded-md border bg-background text-[10px] mt-0.5"
        />
      </div>
      
      <div className="flex gap-1.5 pt-0.5">
        <Button size="sm" onClick={handleInsert} className="flex-1 h-7 text-[10px] font-medium">
          确认
        </Button>
        <Button size="sm" variant="outline" onClick={onClose} className="h-7 text-[10px]">
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

  // 按类型分列: 送+换 vs 收
  const deliverySwapOrders = useMemo(() => filteredOrders.filter(o => o.type === 'delivery' || o.type === 'swap'), [filteredOrders]);
  const pickupOrders = useMemo(() => filteredOrders.filter(o => o.type === 'pickup'), [filteredOrders]);

  return (
    <div className="w-[440px] flex flex-col h-full bg-muted/30 rounded-lg">
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
          <div className="flex-1 border-r p-1.5 space-y-1.5 overflow-y-auto">
            <div className="sticky top-0 bg-muted/80 backdrop-blur-sm rounded px-2 py-1 text-[10px] font-bold text-muted-foreground flex items-center justify-between z-10">
              <span>📦 送桶 / 换桶</span>
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
          <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto">
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

// ============ Driver Column ============
function DriverColumn({
  driver, vehicle, vehicles, onChangeVehicle, assignments, allAssignments, jobSteps, commonLocations, bins, swapToPickup, onCancel, hasChanges, onSave, isSaving, onInsertStep, onDeleteStep, onOpenLinkDialog, insertStepAt, setInsertStepAt, onViewStep
}: {
  driver: Profile;
  vehicle: Vehicle | undefined;
  vehicles: Vehicle[];
  onChangeVehicle: (id: string) => void;
  assignments: Assignment[];
  allAssignments: Assignment[];
  jobSteps: JobStep[];
  commonLocations: CommonLocation[];
  bins: Bin[];
  swapToPickup: Record<string, string>;
  onCancel: (id: string) => void;
  hasChanges?: boolean;
  onSave?: () => void;
  isSaving?: boolean;
  onInsertStep: (params: { driverId: string; position: number; location: string; stepType: string; binId?: string; notes?: string; orderId?: string }) => void;
  onDeleteStep: (stepId: string) => void;
  onOpenLinkDialog: (stepId: string) => void;
  insertStepAt: { driverId: string; position: number; adjacentOrderId?: string; adjacentOrderType?: string } | null;
  setInsertStepAt: (value: { driverId: string; position: number; adjacentOrderId?: string; adjacentOrderType?: string } | null) => void;
  onViewStep: (step: JobStep) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: driver.id });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const combinedRef = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    scrollRef.current = node;
  }, [setNodeRef]);
  const [buttonPosition, setButtonPosition] = useState<{ x: number; y: number } | null>(null);
  
  const handleButtonClick = (position: number, event: React.MouseEvent<HTMLButtonElement>, adjacentOrderId?: string, adjacentOrderType?: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setButtonPosition({ x: rect.left + rect.width / 2, y: rect.top });
    setInsertStepAt({ driverId: driver.id, position, adjacentOrderId, adjacentOrderType });
  };
  
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

  // 计算已完成节点数量，仅首次加载时自动滚动到只显示最后一个已完成的卡片
  const hasAutoScrolled = useRef(false);
  useEffect(() => {
    if (hasAutoScrolled.current) return;
    if (!scrollRef.current || allNodes.length === 0) return;
    let doneCount = 0;
    for (const node of allNodes) {
      if (node.type === 'order') {
        const step = jobSteps.find(s => s.assignment_id === (node.data as Assignment).id);
        if (step?.status === 'done') doneCount++;
        else break;
      } else {
        if ((node.data as JobStep).status === 'done') doneCount++;
        else break;
      }
    }
    if (doneCount > 1) {
      const cardWidth = 168;
      const scrollTo = (doneCount - 1) * cardWidth;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
    hasAutoScrolled.current = true;
  }, [allNodes, jobSteps]);

  return (
    <div className="bg-card border rounded-lg shadow-sm flex flex-col overflow-hidden">
      <div className="px-3 py-1.5 border-b bg-muted/20 flex items-center justify-between">
        <div className="font-semibold text-sm tracking-tight flex items-center gap-1.5">
          <span>👤</span> {driver.name}
          <Badge variant="secondary" className="px-1.5 text-[10px] font-normal">{allNodes.length} 步</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={vehicle?.id ?? ""} onValueChange={onChangeVehicle}>
            <SelectTrigger className="h-6 w-[140px] text-[11px] bg-background">
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
            <Button size="sm" onClick={onSave} disabled={isSaving} className="h-6 text-[11px] px-2 shadow-sm font-bold">
              同步修改
            </Button>
          )}
        </div>
      </div>

      <div
        ref={combinedRef}
        className={cn(
          "relative p-2 flex flex-row gap-0 overflow-x-auto min-h-[120px] transition-colors custom-scrollbar",
          isOver ? "bg-primary/5" : "bg-muted/5"
        )}
      >
        {/* 插入表单 - 使用 fixed 定位悬浮在按钮上方 */}
        {insertStepAt?.driverId === driver.id && buttonPosition && (
          <div 
            className="fixed z-[100]" 
            style={{ 
              left: `${buttonPosition.x}px`, 
              top: `${Math.max(80, buttonPosition.y - 10)}px`,
              transform: 'translateX(-50%)'
            }}
          >
            <InsertStepButton
              driverId={driver.id}
              position={insertStepAt.position}
              isActive={true}
              onClick={() => {}}
              onClose={() => {
                setInsertStepAt(null);
                setButtonPosition(null);
              }}
              onInsert={(params) => {
                onInsertStep(params);
                setButtonPosition(null);
              }}
              commonLocations={commonLocations}
              bins={bins}
              adjacentOrderId={insertStepAt.adjacentOrderId}
              adjacentOrderType={insertStepAt.adjacentOrderType}
            />
          </div>
        )}
        
        <SortableContext
          items={allNodes.map(node => 
            node.type === 'order' 
              ? cardId.fromAssignment((node.data as Assignment).id)
              : `step:${(node.data as JobStep).id}`
          )}
          strategy={horizontalListSortingStrategy}
        >
          {allNodes.map((node, index) => {
            const nodeId = node.type === 'order' 
              ? cardId.fromAssignment((node.data as Assignment).id)
              : `step:${(node.data as JobStep).id}`;
            
            return (
              <SortableNode key={nodeId} id={nodeId}>
                <div className="relative flex items-center shrink-0 group/item">
                  {/* 前置插入按钮 - 只在第一个节点前显示，且只在悬停时显示 */}
                  {index === 0 && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 opacity-0 group-hover/item:opacity-100 transition-opacity z-20">
                      <button
                        onClick={(e) => handleButtonClick(0, e)}
                        className="w-8 h-8 rounded-full border-2 border-dashed border-primary/50 hover:border-primary hover:bg-primary/10 transition-all flex items-center justify-center text-primary bg-card shadow-md"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  
                  {/* 卡片内容 */}
                  {node.type === 'order' ? (
                    <OrderNodeDisplay
                      assignment={node.data as Assignment}
                      vehicle={vehicle}
                      onCancel={onCancel}
                      jobStep={jobSteps.find(s => s.assignment_id === (node.data as Assignment).id)}
                      onClick={() => {
                        const step = jobSteps.find(s => s.assignment_id === (node.data as Assignment).id);
                        if (step) onViewStep(step);
                      }}
                    />
                  ) : (
                    <StepNodeDisplay
                      step={node.data as JobStep}
                      onDelete={onDeleteStep}
                      onClick={() => onViewStep(node.data as JobStep)}
                      linkedOrderLabel={(() => {
                        const s = node.data as JobStep;
                        if (s.step_type !== 'dump_waste' || !s.order_id) return undefined;
                        const linked = allAssignments.find(a => a.order_id === s.order_id);
                        if (linked) return `#${linked.orders?.order_number} ${linked.orders?.customer_name?.slice(0, 8) ?? ''}`;
                        return `订单 ${s.order_id.slice(0, 6)}…`;
                      })()}
                      onOpenLinkDialog={onOpenLinkDialog}
                    />
                  )}
                  
                  {/* 后置插入按钮 - 只在悬停时显示 */}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 opacity-0 group-hover/item:opacity-100 transition-opacity z-20">
                    <button
                      onClick={(e) => {
                        let orderId = node.type === 'order' ? (node.data as Assignment).order_id : undefined;
                        const orderType = node.type === 'order' ? (node.data as Assignment).orders?.type : undefined;
                        // 换桶订单: 倒垃圾应关联其子收桶单，而非换桶单本身；没有子收桶单则不绑定
                        if (orderType === 'swap' && orderId) {
                          orderId = swapToPickup[orderId] || undefined;
                        }
                        handleButtonClick(node.stepNumber + 1, e, orderId, orderType);
                      }}
                      className="w-8 h-8 rounded-full border-2 border-dashed border-primary/50 hover:border-primary hover:bg-primary/10 transition-all flex items-center justify-center text-primary bg-card shadow-md"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </SortableNode>
            );
          })}
        </SortableContext>
        
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

// ============ Sortable Node (for driver rows) ============
function SortableNode({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
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

// ============ Link Order Dialog ============
function LinkOrderDialog({
  stepId, currentOrderId, onSelect, onClose
}: {
  stepId: string;
  currentOrderId: string | null;
  onSelect: (orderId: string | null) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");

  // 查询最近 7 天的收桶/换桶订单（跨所有司机）
  const { data: recentOrders = [], isLoading } = useQuery({
    queryKey: ["link-orders-search"],
    queryFn: async () => {
      const today = new Date();
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const fromDate = weekAgo.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, type, customer_name, address, service_date, status")
        .in("type", ["pickup", "swap"])
        .gte("service_date", fromDate)
        .order("service_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = recentOrders.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.order_number?.toLowerCase().includes(q) ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.address?.toLowerCase().includes(q)
    );
  });

  const typeLabel = (t: string) => t === 'pickup' ? '收桶' : t === 'swap' ? '换桶' : t;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>关联订单</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground mb-1">
          搜索最近 7 天的收桶/换桶订单
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索订单号、客户名、地址…"
          className="w-full h-8 px-2 rounded-md border bg-background text-sm"
          autoFocus
        />
        <div className="flex-1 overflow-y-auto border rounded-md mt-1 min-h-[200px] max-h-[400px]">
          {isLoading ? (
            <div className="text-center text-muted-foreground text-xs py-8">加载中…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground text-xs py-8">无匹配订单</div>
          ) : (
            filtered.map(o => (
              <button
                key={o.id}
                onClick={() => onSelect(o.id)}
                className={cn(
                  "w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 transition-colors",
                  currentOrderId === o.id && "bg-amber-50 border-l-2 border-l-amber-500"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">#{o.order_number}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                      {typeLabel(o.type)}
                    </Badge>
                    <span className="text-[9px] text-muted-foreground">{o.service_date}</span>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground truncate">{o.customer_name}</div>
                <div className="text-[9px] text-muted-foreground/70 truncate">{o.address}</div>
                {currentOrderId === o.id && (
                  <div className="text-[9px] text-amber-600 font-semibold mt-0.5">✓ 当前关联</div>
                )}
              </button>
            ))
          )}
        </div>
        <DialogFooter className="flex gap-2">
          {currentOrderId && (
            <Button variant="outline" size="sm" onClick={() => onSelect(null)} className="text-xs">
              取消关联
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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


// ============ Step Detail Dialog ============
function StepDetailDialog({
  step, onClose
}: {
  step: JobStep;
  onClose: () => void;
}) {
  const stepTypeLabels: Record<string, string> = {
    'pickup_bin': '取桶',
    'drop_bin': '放桶',
    'dump_waste': '倒垃圾',
    'load_material': '装料',
    'unload_material': '卸料',
    'customer_delivery': '客户送桶',
    'customer_pickup': '客户收桶',
    'depot_pickup': '仓库取桶',
    'dump_site': '垃圾场倒垃圾',
  };
  const stepLabel = stepTypeLabels[step.step_type] || step.step_type;
  const isDone = step.status === "done";

  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{stepLabel}</span>
              {isDone && (
                <Badge className="bg-status-done text-white">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  已完成
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">步骤编号</Label>
                <div className="text-sm font-medium mt-1">#{step.step_number}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">状态</Label>
                <div className="text-sm font-medium mt-1">
                  {step.status === "done" ? "✅ 已完成" : 
                   step.status === "in_progress" ? "🔄 进行中" : 
                   step.status === "pending" ? "⏳ 待执行" : "🔒 锁定"}
                </div>
              </div>
            </div>

            {/* 地点 */}
            <div>
              <Label className="text-xs text-muted-foreground">地点</Label>
              <div className="text-sm mt-1 flex items-start gap-2">
                <MapPin className="h-4 w-4 text-primary mt-0.5" />
                <span>{step.location}</span>
              </div>
            </div>

            {/* 桶号信息 */}
            {step.bin_number_reported && (
              <div>
                <Label className="text-xs text-muted-foreground">桶号</Label>
                <div className="text-sm font-medium mt-1 text-primary">
                  {step.bin_number_reported}
                </div>
              </div>
            )}

            {/* 旧桶号（换桶时） */}
            {step.old_bin_number_reported && (
              <div>
                <Label className="text-xs text-muted-foreground">旧桶号（收回）</Label>
                <div className="text-sm font-medium mt-1 text-orange-600">
                  {step.old_bin_number_reported}
                </div>
              </div>
            )}

            {/* 垃圾场 */}
            {step.dump_site && (
              <div>
                <Label className="text-xs text-muted-foreground">垃圾场</Label>
                <div className="text-sm mt-1">{step.dump_site}</div>
              </div>
            )}

            {/* 重量 */}
            {step.weight_kg && (
              <div>
                <Label className="text-xs text-muted-foreground">重量</Label>
                <div className="text-sm font-medium mt-1">
                  ⚖️ {step.weight_kg} kg
                </div>
              </div>
            )}

            {/* 备注 */}
            {step.notes && (
              <div>
                <Label className="text-xs text-muted-foreground">备注</Label>
                <div className="text-sm mt-1 bg-muted p-2 rounded">
                  {step.notes}
                </div>
              </div>
            )}

            {/* 完成时间 */}
            {step.completed_at && (
              <div>
                <Label className="text-xs text-muted-foreground">完成时间</Label>
                <div className="text-sm mt-1">
                  {new Date(step.completed_at).toLocaleString('zh-CN')}
                </div>
              </div>
            )}

            {/* 照片 */}
            {step.photo_url && (
              <div>
                <Label className="text-xs text-muted-foreground">现场照片</Label>
                <div 
                  className="mt-2 rounded-lg overflow-hidden border bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setSelectedImage(step.photo_url)}
                >
                  <img 
                    src={step.photo_url} 
                    alt="现场照片" 
                    className="w-full h-auto max-h-[300px] object-contain"
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  点击图片放大查看
                </div>
              </div>
            )}

            {/* 磅单照片 */}
            {step.weigh_ticket_url && (
              <div>
                <Label className="text-xs text-muted-foreground">磅单照片</Label>
                <div 
                  className="mt-2 rounded-lg overflow-hidden border bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setSelectedImage(step.weigh_ticket_url)}
                >
                  <img 
                    src={step.weigh_ticket_url} 
                    alt="磅单照片" 
                    className="w-full h-auto max-h-[300px] object-contain"
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  点击图片放大查看
                </div>
              </div>
            )}

            {/* 如果没有图片 */}
            {!step.photo_url && !step.weigh_ticket_url && isDone && (
              <div className="text-sm text-muted-foreground text-center py-4 bg-muted/50 rounded">
                此步骤没有上传图片
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={onClose}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 图片放大查看 */}
      {selectedImage && (
        <Dialog open onOpenChange={() => setSelectedImage(null)}>
          <DialogContent className="max-w-[90vw] max-h-[90vh] p-2">
            <div className="relative">
              <img 
                src={selectedImage} 
                alt="放大查看" 
                className="w-full h-auto max-h-[85vh] object-contain"
              />
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => setSelectedImage(null)}
              >
                关闭
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
