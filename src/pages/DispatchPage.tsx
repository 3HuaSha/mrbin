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
  ChevronLeft, ChevronRight, AlertTriangle, MoreVertical, Plus, MapPin, CheckCircle2, Camera, Image as ImageIcon,
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

export function DispatchPage() {
  const qc = useQueryClient();
  const audit = useAudit();
  const [date, setDate] = useState(todayISO());
  const [businessType, setBusinessType] = useBusinessType();
  const [localAssignments, setLocalAssignments] = useState<Assignment[] | null>(null);
  const [localJobSteps, setLocalJobSteps] = useState<JobStep[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [insertStepAt, setInsertStepAt] = useState<{ driverId: string; position: number } | null>(null);
  const [viewingStep, setViewingStep] = useState<JobStep | null>(null);

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
    queryKey: ["dispatch-orders", date, businessType],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*")
        .eq("service_date", date)
        .eq("business_type", businessType)
        .neq("status", "cancelled").order("created_at");
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });
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
      
      // 更新手动步骤的位置（如果有本地修改）
      if (localJobSteps) {
        for (const localStep of localJobSteps) {
          // 只处理手动步骤（node_type === 'step'）
          if (localStep.node_type === 'step' && !localStep.id.startsWith('temp-')) {
            const originalStep = jobSteps.find(s => s.id === localStep.id);
            // 如果 step_number 或 driver_id 发生变化，则更新
            if (originalStep && (originalStep.step_number !== localStep.step_number || originalStep.driver_id !== localStep.driver_id)) {
              await supabase.from("job_steps").update({
                step_number: localStep.step_number,
                driver_id: localStep.driver_id,
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
    }) => {
      const { driverId, position, location, stepType, binId, notes } = params;
      
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
        
        // 只处理同一司机的拖拽
        if (activeDriverId !== overDriverId) {
          console.log('不同司机，跳过');
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
                    onViewStep={(step) => setViewingStep(step)}
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

        {/* 步骤详情弹窗 */}
        {viewingStep && (
          <StepDetailDialog
            step={viewingStep}
            onClose={() => setViewingStep(null)}
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
        "group relative rounded-lg border-l-4 shadow-md p-2.5 transition-all duration-300 hover:shadow-xl hover:scale-105 hover:z-10 w-[180px] shrink-0",
        isDone 
          ? "border-l-status-done bg-status-done/10" 
          : "border-l-blue-500 bg-card",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold leading-tight">
            {tm.emoji} {tm.label} {order.bin_size ? `${order.bin_size}yd` : ""} {binTypeName}
          </div>
          {isDone && <CheckCircle2 className="h-4 w-4 text-status-done" />}
        </div>
        <div className="text-[10px] text-muted-foreground leading-snug break-words" title={order.address}>
          {order.address}
        </div>
        <div className="text-[10px] text-primary font-medium">{timeLabel(order)}</div>
        {jobStep?.bin_number_reported && (
          <div className="text-[10px] text-primary">桶号: {jobStep.bin_number_reported}</div>
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
  step, onDelete, onClick
}: {
  step: JobStep;
  onDelete: (id: string) => void;
  onClick?: () => void;
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

  return (
    <div 
      className={cn(
        "group relative rounded-lg border-l-4 shadow-sm p-2 transition-all duration-300 hover:shadow-lg hover:scale-105 hover:z-10 w-[150px] shrink-0",
        isDone 
          ? "border-l-status-done bg-status-done/10" 
          : "border-l-gray-400 bg-card/80",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-[8px] w-fit">手动步骤</Badge>
          {isDone && <CheckCircle2 className="h-3 w-3 text-status-done" />}
        </div>
        <div className="text-[11px] font-semibold">
          {stepLabel}
        </div>
        <div className="text-[9px] text-muted-foreground leading-snug break-words" title={step.location}>
          <MapPin className="h-2 w-2 inline mr-0.5" />
          {step.location}
        </div>
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
        <DropdownMenuContent align="end" className="text-xs min-w-[120px]">
          {onClick && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(); }}>
              查看详情
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
    if (!binSize) {
      toast.error("请选择桶大小");
      return;
    }
    
    // 将桶大小添加到备注中
    const finalNotes = notes ? `${binSize}yd - ${notes}` : `${binSize}yd`;
    
    onInsert({ driverId, position, location, stepType, notes: finalNotes });
    
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
      
      {/* 第三行：桶大小 */}
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
  driver, vehicle, vehicles, onChangeVehicle, assignments, jobSteps, commonLocations, bins, onCancel, hasChanges, onSave, isSaving, onInsertStep, onDeleteStep, insertStepAt, setInsertStepAt, onViewStep
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
  onViewStep: (step: JobStep) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: driver.id });
  const [buttonPosition, setButtonPosition] = useState<{ x: number; y: number } | null>(null);
  
  const handleButtonClick = (position: number, event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setButtonPosition({ x: rect.left + rect.width / 2, y: rect.top });
    setInsertStepAt({ driverId: driver.id, position });
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
          "relative p-3 flex flex-row gap-0 overflow-x-auto min-h-[160px] transition-colors custom-scrollbar",
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
            />
          </div>
        )}
        
        <SortableContext
          items={allNodes.map(node => 
            node.type === 'order' 
              ? cardId.fromAssignment((node.data as Assignment).id)
              : `step:${(node.data as JobStep).id}`
          )}
          strategy={rectSortingStrategy}
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
                    />
                  )}
                  
                  {/* 后置插入按钮 - 只在悬停时显示 */}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 opacity-0 group-hover/item:opacity-100 transition-opacity z-20">
                    <button
                      onClick={(e) => handleButtonClick(node.stepNumber + 1, e)}
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
