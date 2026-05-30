import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { 
  ChevronLeft, 
  ChevronRight, 
} from "lucide-react";
import { todayISO, isAMTimeWindow, isPMTimeWindow } from "@/lib/business";
import { toast } from "sonner";
import {
  DndContext, 
  type DragEndEvent, 
  type DragStartEvent, 
  PointerSensor,
  useSensor, 
  useSensors, 
  DragOverlay, 
  closestCenter,
  pointerWithin,
  type CollisionDetection,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { BusinessTypeSelector } from "@/components/BusinessTypeSelector";
import { useBusinessType } from "@/lib/business-type-storage";
import { useDispatchData } from "@/hooks/use-dispatch-data";
import { 
  Assignment, 
  JobStep, 
  Order,
  Vehicle,
  Profile,
  Bin,
  CommonLocation,
  DriverVehicleAssignment
} from "@/types/dispatch";

// 子组件导入
import { BacklogColumn } from "@/components/dispatch/BacklogColumn";
import { DriverColumn } from "@/components/dispatch/DriverColumn";
import { OrderCardDisplay } from "@/components/dispatch/OrderCardDisplay";
import { StepDetailDialog } from "@/components/dispatch/StepDetailDialog";
import { LinkOrderDialog } from "@/components/dispatch/LinkOrderDialog";
import { BrickScheduleAssistant } from "@/components/dispatch/BrickScheduleAssistant";

const BACKLOG_ID = "__backlog__";

const cardId = {
  fromOrder: (id: string) => `o:${id}`,
  fromAssignment: (id: string) => `a:${id}`,
  parse: (id: string) => {
    if (id.startsWith("a:")) return { kind: "assignment" as const, id: id.slice(2) };
    if (id.startsWith("o:")) return { kind: "order" as const, id: id.slice(2) };
    return null;
  },
};

const multiContainerCollision: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return closestCenter(args);
};

export function DispatchPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [businessType, setBusinessType] = useBusinessType();
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSaveSignatureRef = useRef("");
  
  // 使用封装的数据钩子
  const {
    drivers,
    vehicles,
    allVehicles,
    vehicleAssignments,
    bins,
    orders,
    swapToPickup,
    assignments,
    jobSteps,
    commonLocations,
  } = useDispatchData(date, businessType);

  const [localAssignments, setLocalAssignments] = useState<Assignment[] | null>(null);
  const [localJobSteps, setLocalJobSteps] = useState<JobStep[] | null>(null);

  // 实时订阅: 当司机完成任务时, 管理端自动刷新
  useEffect(() => {
    const chName = `dispatch-rt-${date}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(chName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'job_steps',
          filter: `scheduled_date=eq.${date}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["job-steps", date] });
          qc.invalidateQueries({ queryKey: ["dispatch-orders", date] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dispatch_assignments',
          filter: `scheduled_date=eq.${date}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["dispatch-assignments", date] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [date, qc]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [insertStepAt, setInsertStepAt] = useState<{ driverId: string; position: number; adjacentOrderId?: string; adjacentOrderType?: string } | null>(null);
  const [viewingStep, setViewingStep] = useState<JobStep | null>(null);
  const [linkingStepId, setLinkingStepId] = useState<string | null>(null);

  const currentAssignments = localAssignments ?? assignments;
  const currentJobSteps = localJobSteps ?? jobSteps;

  // 实时合并: 当司机端更新任务状态时，将状态变化同步到本地副本
  useEffect(() => {
    if (!localJobSteps) return;
    let changed = false;
    const merged = localJobSteps.map(local => {
      const server = jobSteps.find(s => s.id === local.id);
      if (server && server.status !== local.status) {
        changed = true;
        return { ...local, status: server.status };
      }
      return local;
    });
    if (changed) setLocalJobSteps(merged);
  }, [jobSteps]);

  const completedOrders = useMemo(() => orders.filter(o => o.status === "done"), [orders]);
  const activeOrders = useMemo(() => orders.filter(o => o.status !== "done"), [orders]);

  const assignedOrderIds = useMemo(
    () => new Set(currentAssignments.map((a) => a.order_id)),
    [currentAssignments],
  );

  const unassigned = useMemo(
    () => activeOrders.filter((o) => !assignedOrderIds.has(o.id)),
    [activeOrders, assignedOrderIds],
  );

  const [driverVehicle, setDriverVehicle] = useState<Record<string, string>>({});
  
  const getDriverVehicle = (driverId: string) => {
    if (driverVehicle[driverId]) return driverVehicle[driverId];
    const fleetAssignment = vehicleAssignments.find((a: DriverVehicleAssignment) => a.driver_id === driverId);
    if (fleetAssignment?.vehicle_id) return fleetAssignment.vehicle_id;
    const fromAssignment = currentAssignments.find((a) => a.driver_id === driverId)?.vehicle_id;
    return fromAssignment ?? vehicles[0]?.id ?? "";
  };

  const getVehicle = (driverId: string) =>
    vehicles.find((v) => v.id === getDriverVehicle(driverId)) || allVehicles.find(v => v.id === getDriverVehicle(driverId));

  // ============ Mutations ============
  const saveAllChanges = useMutation({
    mutationFn: async () => {
      if (!localAssignments) return;
      const inserts = localAssignments.filter(a => a.id.startsWith("temp-"));
      const updates = localAssignments.filter(a => !a.id.startsWith("temp-"));
      const deletes = assignments.filter(a => !localAssignments.some(la => la.id === a.id));

      for (const d of deletes) {
        await supabase.from("job_steps").delete().eq("assignment_id", d.id);
        await supabase.from("dispatch_assignments").delete().eq("id", d.id);
      }
      
      for (const i of inserts) {
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
        
        const order = i.orders;
        
        const displayStep = {
          assignment_id: newAssignment.id,
          driver_id: i.driver_id,
          scheduled_date: i.scheduled_date,
          order_id: order.id,
          node_type: 'order' as const,
          step_number: i.sequence,
          step_type: (order.type === "delivery" ? "delivery" : order.type === "pickup" ? "pickup" : order.type === "swap" ? "swap" : order.type === "material" ? "unload_material" : order.type) as any,
          location: order.address,
          status: 'pending',
        };
        const { error: stepsError } = await supabase.from("job_steps").insert(displayStep);
        if (stepsError) throw stepsError;
      }
      
      for (const u of updates) {
        const old = assignments.find(a => a.id === u.id);
        if (old && (old.sequence !== u.sequence || old.vehicle_id !== u.vehicle_id || old.driver_id !== u.driver_id)) {
          await supabase.from("dispatch_assignments").update({
            driver_id: u.driver_id,
            sequence: u.sequence,
            vehicle_id: u.vehicle_id
          }).eq("id", u.id);
          
          await supabase.from("job_steps").update({
            driver_id: u.driver_id,
          }).eq("assignment_id", u.id);
          await supabase.from("job_steps").update({
            step_number: u.sequence,
          }).eq("assignment_id", u.id).eq("node_type", "order");
        }
      }
      
      // 最终重编号: 遍历每位涉及的司机，构建完整时间轴（订单+手动步骤），
      // 统一重写所有 job_steps 的 step_number，确保插入新订单后顺序正确
      const affectedDriverIds = new Set<string>();
      inserts.forEach(i => affectedDriverIds.add(i.driver_id));
      updates.forEach(u => affectedDriverIds.add(u.driver_id));
      deletes.forEach(d => affectedDriverIds.add(d.driver_id));

      for (const driverId of affectedDriverIds) {
        const driverAsgs = (localAssignments ?? []).filter(a => a.driver_id === driverId).sort((a, b) => a.sequence - b.sequence);
        const stepsSource = localJobSteps ?? jobSteps;
        const driverManualSteps = stepsSource.filter(s => s.driver_id === driverId && s.node_type === 'step').sort((a, b) => a.step_number - b.step_number);

        type TLItem = { kind: 'order'; assignmentId: string; stepNum: number } | { kind: 'step'; stepId: string; stepNum: number };
        const timeline: TLItem[] = [];
        driverAsgs.forEach(a => {
          const js = stepsSource.find(s => s.assignment_id === a.id && s.node_type === 'order');
          timeline.push({ kind: 'order', assignmentId: a.id, stepNum: js ? js.step_number : a.sequence });
        });
        driverManualSteps.forEach(s => {
          timeline.push({ kind: 'step', stepId: s.id, stepNum: s.step_number });
        });
        timeline.sort((a, b) => a.stepNum - b.stepNum);

        for (let i = 0; i < timeline.length; i++) {
          const newNum = i + 1;
          const item = timeline[i];
          if (item.kind === 'order') {
            await supabase.from("job_steps").update({ step_number: newNum }).eq("assignment_id", item.assignmentId).eq("node_type", "order");
          } else {
            await supabase.from("job_steps").update({ step_number: newNum }).eq("id", item.stepId);
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

  useEffect(() => {
    if (!localAssignments || saveAllChanges.isPending) return;
    const signature = JSON.stringify(localAssignments.map((assignment) => ({
      id: assignment.id,
      driver_id: assignment.driver_id,
      vehicle_id: assignment.vehicle_id,
      sequence: assignment.sequence,
      order_id: assignment.order_id,
    })));
    if (lastAutoSaveSignatureRef.current === signature) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      lastAutoSaveSignatureRef.current = signature;
      saveAllChanges.mutate();
    }, 500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [localAssignments, saveAllChanges.isPending]);

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
      // 只处理有 node_type 的步骤（order 和 step），忽略旧的 workflow 子步骤
      const driverSteps = currentJobSteps.filter(
        s => s.driver_id === driverId && s.scheduled_date === date && s.node_type
      ).sort((a, b) => a.step_number - b.step_number);
      
      // 先将现有步骤的 step_number 后移，再插入新步骤
      const stepsToUpdate = driverSteps.filter(s => s.step_number >= position);
      for (const step of stepsToUpdate.reverse()) {
        await supabase.from("job_steps")
          .update({ step_number: step.step_number + 1 })
          .eq("id", step.id);
      }
      
      const { data, error } = await supabase.from("job_steps").insert({
        driver_id: driverId,
        scheduled_date: date,
        step_number: position,
        node_type: 'step',
        location,
        step_type: stepType as any,
        bin_id: binId || null,
        notes: notes || null,
        order_id: orderId || null,
        status: 'pending',
      }).select().single();
      
      if (error) throw error;
      
      return { newStep: data as JobStep, stepsToUpdate };
    },
    onSuccess: (result) => {
      const { newStep, stepsToUpdate } = result;
      const updatedSteps = [...currentJobSteps];
      updatedSteps.push(newStep);
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
      const { error } = await supabase.from("job_steps").delete().eq("id", stepId);
      if (error) throw error;
      
      const laterSteps = currentJobSteps.filter(
        s => s.driver_id === step.driver_id && 
             s.scheduled_date === step.scheduled_date && 
             s.step_number > step.step_number &&
             s.node_type
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
      let updatedSteps = currentJobSteps.filter(s => s.id !== deletedStep.id);
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

  // 砂石料步骤改日期
  const changeMaterialStepDate = useMutation({
    mutationFn: async ({ stepId, newDate }: { stepId: string; newDate: string }) => {
      const { error } = await supabase.from("job_steps")
        .update({ scheduled_date: newDate })
        .eq("id", stepId);
      if (error) throw error;
      return { stepId, newDate };
    },
    onSuccess: ({ stepId, newDate: nd }: { stepId: string; newDate: string }) => {
      if (nd !== date) {
        setLocalJobSteps(currentJobSteps.filter((s: JobStep) => s.id !== stepId));
        toast.success(`步骤已移至 ${nd}`);
      } else {
        setLocalJobSteps(currentJobSteps.map((s: JobStep) => s.id === stepId ? { ...s, scheduled_date: nd } : s));
        toast.success("日期已更新");
      }
      qc.invalidateQueries({ queryKey: ["job-steps"] });
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
    if (saveAllChanges.isPending) {
      toast.message("正在同步上一次调整，请稍等一下");
      return;
    }

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    if (activeIdStr.startsWith('a:')) {
      const asgId = activeIdStr.slice(2);
      const asg = currentAssignments.find(x => x.id === asgId);
      const step = asg ? currentJobSteps.find(s => s.assignment_id === asg.id) : undefined;
      if (step?.status === 'done') return;
    }
    if (activeIdStr.startsWith('step:')) {
      const sId = activeIdStr.slice(5);
      const s = currentJobSteps.find(x => x.id === sId);
      if (s?.status === 'done') return;
    }

    if (activeIdStr.startsWith('step:') && (overIdStr === BACKLOG_ID || overIdStr.startsWith('o:'))) {
      const stepId = activeIdStr.slice(5);
      const step = currentJobSteps.find(s => s.id === stepId);
      if (step && step.node_type === 'step') {
        deleteManualStep.mutate(stepId);
        return;
      }
    }

    if (activeIdStr.startsWith('a:') || activeIdStr.startsWith('step:')) {
      if (overIdStr.startsWith('a:') || overIdStr.startsWith('step:')) {
        let activeAssignment: Assignment | undefined;
        let activeStep: JobStep | undefined;
        let overAssignment: Assignment | undefined;
        let overStep: JobStep | undefined;
        
        if (activeIdStr.startsWith('a:')) {
          activeAssignment = currentAssignments.find(a => a.id === activeIdStr.slice(2));
        } else {
          activeStep = currentJobSteps.find(s => s.id === activeIdStr.slice(5));
        }
        
        if (overIdStr.startsWith('a:')) {
          overAssignment = currentAssignments.find(a => a.id === overIdStr.slice(2));
        } else {
          overStep = currentJobSteps.find(s => s.id === overIdStr.slice(5));
        }
        
        if (!activeAssignment && !activeStep) return;
        if (!overAssignment && !overStep) return;
        
        const activeDriverId = activeAssignment?.driver_id || activeStep?.driver_id;
        const overDriverId = overAssignment?.driver_id || overStep?.driver_id;
        
        if (activeDriverId !== overDriverId) {
          if (!activeDriverId || !overDriverId) return;
          
          if (activeAssignment) {
            // 使用不可变更新，避免直接修改服务器数据对象
            const movedAssignment = { ...activeAssignment, driver_id: overDriverId, vehicle_id: getDriverVehicle(overDriverId) };
            
            // 源司机: 移除该 assignment，重新编号
            const sourceAsgs = currentAssignments
              .filter(x => x.driver_id === activeDriverId && x.id !== activeAssignment!.id)
              .sort((a, b) => a.sequence - b.sequence)
              .map((x, i) => ({ ...x, sequence: i + 1 }));
            
            // 目标司机: 插入该 assignment，重新编号
            const targetAsgs = currentAssignments
              .filter(x => x.driver_id === overDriverId)
              .sort((a, b) => a.sequence - b.sequence);
            let insertIdx = targetAsgs.length;
            if (overAssignment) {
              insertIdx = targetAsgs.findIndex(x => x.id === overAssignment!.id);
              if (insertIdx < 0) insertIdx = targetAsgs.length;
            }
            // 确保插在已完成任务之后
            const doneCountCross = targetAsgs.filter(x => {
              const s = currentJobSteps.find(s => s.assignment_id === x.id && s.node_type === 'order');
              return s?.status === 'done';
            }).length;
            insertIdx = Math.max(insertIdx, doneCountCross);
            targetAsgs.splice(insertIdx, 0, movedAssignment);
            const renumberedTarget = targetAsgs.map((x, i) => ({ ...x, sequence: i + 1 }));
            
            // 其他司机保持不变
            const otherAsgs = currentAssignments.filter(x => x.driver_id !== activeDriverId && x.driver_id !== overDriverId);
            const finalAssignments = [...otherAsgs, ...sourceAsgs, ...renumberedTarget];
            setLocalAssignments(finalAssignments);
            
            const updatedSteps = currentJobSteps.map(s => s.assignment_id === activeAssignment!.id ? { ...s, driver_id: overDriverId } : s);
            setLocalJobSteps(updatedSteps);
          } else if (activeStep && activeStep.node_type === 'step') {
            const updatedSteps = currentJobSteps.map(s => s.id === activeStep!.id ? { ...s, driver_id: overDriverId } : s);
            setLocalJobSteps(updatedSteps);
          }
          return;
        }

        if (!activeDriverId) return;
        const driverAssignments = currentAssignments.filter(a => a.driver_id === activeDriverId);
        const driverSteps = currentJobSteps.filter(s => s.driver_id === activeDriverId && s.node_type === 'step');
        
        type NodeItem = { type: 'assignment' | 'step'; data: Assignment | JobStep; stepNumber: number };
        const allItems: NodeItem[] = [];
        
        driverAssignments.forEach(a => {
          const assignmentSteps = currentJobSteps.filter(s => s.assignment_id === a.id);
          const stepNumber = assignmentSteps.length > 0 ? assignmentSteps[0].step_number : a.sequence;
          allItems.push({ type: 'assignment', data: a, stepNumber });
        });
        
        driverSteps.forEach(s => allItems.push({ type: 'step', data: s, stepNumber: s.step_number }));
        allItems.sort((a, b) => a.stepNumber - b.stepNumber);
        
        const oldIndex = allItems.findIndex(item => item.type === (activeAssignment ? 'assignment' : 'step') && (activeAssignment ? (item.data as Assignment).id === activeAssignment.id : (item.data as JobStep).id === activeStep?.id));
        const newIndex = allItems.findIndex(item => item.type === (overAssignment ? 'assignment' : 'step') && (overAssignment ? (item.data as Assignment).id === overAssignment.id : (item.data as JobStep).id === overStep?.id));
        
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
        const reordered = arrayMove(allItems, oldIndex, newIndex);
        const newAssignments = [...currentAssignments];
        const newSteps = [...currentJobSteps];
        
        reordered.forEach((item, index) => {
          const newStepNumber = index + 1;
          if (item.type === 'assignment') {
            const aIndex = newAssignments.findIndex(a => a.id === (item.data as Assignment).id);
            if (aIndex >= 0) newAssignments[aIndex] = { ...newAssignments[aIndex], sequence: newStepNumber };
            const stepIndex = newSteps.findIndex(s => s.assignment_id === (item.data as Assignment).id);
            if (stepIndex >= 0) newSteps[stepIndex] = { ...newSteps[stepIndex], step_number: newStepNumber };
          } else {
            const sIndex = newSteps.findIndex(s => s.id === (item.data as JobStep).id);
            if (sIndex >= 0) newSteps[sIndex] = { ...newSteps[sIndex], step_number: newStepNumber };
          }
        });
        
        setLocalAssignments(newAssignments);
        setLocalJobSteps(newSteps);
        return;
      }
    }

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
        const step = currentJobSteps.find((x) => x.id === overIdStr.slice(5));
        if (step) targetColumnId = step.driver_id;
      } else {
        targetColumnId = overIdStr;
      }
    }

    if (!targetColumnId) return;
    const newAssignments = [...currentAssignments];

    if (card.kind === "order") {
      if (targetColumnId === BACKLOG_ID) return;
      const order = orders.find((o) => o.id === card.id);
      if (!order) return;

      const targetDriver = targetColumnId;
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
        vehicles: vehicles.find(v => v.id === targetVehicleId) || allVehicles.find((v: Vehicle) => v.id === targetVehicleId) || { id: "", name: "未选", type: "HINO", max_bin_size: null } as any,
        bins: null,
        created_at: new Date().toISOString(),
        dispatch_notes: null
      };

      // 构建完整时间轴 (assignments + manual steps)，按 step_number 排序
      const driverAsgs = newAssignments.filter(a => a.driver_id === targetDriver);
      const driverManualSteps = currentJobSteps.filter(s => s.driver_id === targetDriver && s.node_type === 'step');
      type TLItem = { kind: 'asg'; data: Assignment; stepNum: number; done: boolean } | { kind: 'step'; data: JobStep; stepNum: number; done: boolean };
      const timeline: TLItem[] = [];
      driverAsgs.forEach(a => {
        const js = currentJobSteps.find(s => s.assignment_id === a.id && s.node_type === 'order');
        timeline.push({ kind: 'asg', data: a, stepNum: js ? js.step_number : a.sequence, done: js?.status === 'done' });
      });
      driverManualSteps.forEach(s => {
        timeline.push({ kind: 'step', data: s, stepNum: s.step_number, done: s.status === 'done' });
      });
      timeline.sort((a, b) => a.stepNum - b.stepNum);

      // 确定插入位置（在完整时间轴中）
      let insertIdx = timeline.length;
      if (overParsed && overParsed.kind === "assignment") {
        const idx = timeline.findIndex(t => t.kind === 'asg' && t.data.id === overParsed.id);
        if (idx >= 0) insertIdx = idx;
      } else if (overIdStr.startsWith('step:')) {
        const idx = timeline.findIndex(t => t.kind === 'step' && t.data.id === overIdStr.slice(5));
        if (idx >= 0) insertIdx = idx;
      }
      // 确保新任务插在所有已完成任务之后
      const lastDoneIdx = timeline.reduce((max, t, i) => t.done ? i : max, -1);
      insertIdx = Math.max(insertIdx, lastDoneIdx + 1);

      // 插入新 assignment 到时间轴
      const newItem: TLItem = { kind: 'asg', data: newAsg, stepNum: 0, done: false };
      timeline.splice(insertIdx, 0, newItem);

      // 重新编号所有 step_number / sequence
      const updatedAssignments = [...newAssignments];
      const updatedSteps = [...currentJobSteps];
      timeline.forEach((item, i) => {
        const num = i + 1;
        if (item.kind === 'asg') {
          const aIdx = updatedAssignments.findIndex(a => a.id === item.data.id);
          if (aIdx >= 0) {
            updatedAssignments[aIdx] = { ...updatedAssignments[aIdx], sequence: num };
          }
          const sIdx = updatedSteps.findIndex(s => s.assignment_id === item.data.id && s.node_type === 'order');
          if (sIdx >= 0) updatedSteps[sIdx] = { ...updatedSteps[sIdx], step_number: num };
        } else {
          const sIdx = updatedSteps.findIndex(s => s.id === item.data.id);
          if (sIdx >= 0) updatedSteps[sIdx] = { ...updatedSteps[sIdx], step_number: num };
        }
      });
      // 添加新 assignment（还没在 updatedAssignments 中）
      newAsg.sequence = insertIdx + 1;
      updatedAssignments.push(newAsg);

      setLocalAssignments(updatedAssignments);
      setLocalJobSteps(updatedSteps);
      return;
    }

    const aIndex = newAssignments.findIndex(x => x.id === card.id);
    if (aIndex < 0) return;
    const a = newAssignments[aIndex];

    if (targetColumnId === BACKLOG_ID) {
      newAssignments.splice(aIndex, 1);
      const driverAsgs = newAssignments.filter(x => x.driver_id === a.driver_id).sort((x, y) => x.sequence - y.sequence);
      driverAsgs.forEach((x, i) => x.sequence = i + 1);
      setLocalAssignments(newAssignments);
      return;
    }

    const targetDriver = targetColumnId;
    if (a.driver_id === targetDriver) {
      const driverAsgs = newAssignments.filter((x) => x.driver_id === targetDriver).sort((x, y) => x.sequence - y.sequence);
      const oldIndex = driverAsgs.findIndex((x) => x.id === a.id);
      let newIndex = overParsed?.kind === "assignment" ? driverAsgs.findIndex((x) => x.id === overParsed.id) : driverAsgs.length - 1;
      if (newIndex < 0) newIndex = driverAsgs.length - 1;
      if (oldIndex === newIndex) return;
      const reordered = arrayMove(driverAsgs, oldIndex, newIndex);
      reordered.forEach((x, i) => { x.sequence = i + 1; });
      const finalAssignments = newAssignments.map(x => x.driver_id === targetDriver ? reordered.find(r => r.id === x.id)! : x);
      setLocalAssignments(finalAssignments);
      return;
    }

    newAssignments.splice(aIndex, 1);
    const oldDriverAsgs = newAssignments.filter(x => x.driver_id === a.driver_id).sort((x, y) => x.sequence - y.sequence);
    oldDriverAsgs.forEach((x, i) => x.sequence = i + 1);

    a.driver_id = targetDriver;
    a.vehicle_id = getDriverVehicle(targetDriver);

    const targetDriverAsgs = newAssignments.filter(x => x.driver_id === targetDriver).sort((x, y) => x.sequence - y.sequence);
    let insertIndex = (overParsed && overParsed.kind === "assignment") ? targetDriverAsgs.findIndex(x => x.id === overParsed.id) : targetDriverAsgs.length;
    if (insertIndex < 0) insertIndex = targetDriverAsgs.length;
    // 确保插在已完成任务之后
    const doneCountMove = targetDriverAsgs.filter(x => {
      const s = currentJobSteps.find(s => s.assignment_id === x.id && s.node_type === 'order');
      return s?.status === 'done';
    }).length;
    insertIndex = Math.max(insertIndex, doneCountMove);

    targetDriverAsgs.splice(insertIndex, 0, a);
    targetDriverAsgs.forEach((x, i) => x.sequence = i + 1);
    const finalAssignments = newAssignments.filter(x => x.driver_id !== targetDriver).concat(targetDriverAsgs);
    setLocalAssignments(finalAssignments);
  };

  const activeCard = activeId ? cardId.parse(activeId) : null;
  const activeOrder = activeCard?.kind === "order" ? orders.find((o) => o.id === activeCard.id) : (activeCard?.kind === "assignment" ? currentAssignments.find((a) => a.id === activeCard.id)?.orders : undefined);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-3 h-screen flex flex-col">
        <div className="flex items-center justify-between mb-2 gap-4">
          <h1 className="text-2xl font-bold">排班看板</h1>
          <div className="flex items-center gap-3">
            <BusinessTypeSelector value={businessType} onChange={setBusinessType} />
            {businessType === "brick" && (
              <BrickScheduleAssistant
                drivers={drivers}
                assignments={currentAssignments}
                unassigned={unassigned}
                getVehicle={getVehicle}
              />
            )}
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
            <div className="h-full shrink-0 pr-3 border-r overflow-y-auto pt-2">
              <BacklogColumn 
                orders={unassigned} 
                completedOrders={completedOrders} 
                businessType={businessType}
                cardId={cardId}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-1.5 space-y-1 bg-muted/10">
              {drivers.map((d) => {
                const list = currentAssignments.filter((a) => a.driver_id === d.id).sort((x, y) => x.sequence - y.sequence);
                const driverSteps = currentJobSteps.filter(s => s.driver_id === d.id);
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
                    onChangeVehicle={(v: string) => {
                      if (saveAllChanges.isPending) {
                        toast.message("正在同步上一次调整，请稍等一下");
                        return;
                      }
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
                    onCancel={(id: string) => {
                      if (saveAllChanges.isPending) {
                        toast.message("正在同步上一次调整，请稍等一下");
                        return;
                      }
                      const newAssignments = currentAssignments.filter((x: Assignment) => x.id !== id);
                      setLocalAssignments(newAssignments);
                    }}
                    hasChanges={hasChanges}
                    isSaving={saveAllChanges.isPending}
                    onInsertStep={(params: any) => insertManualStep.mutate(params)}
                    onDeleteStep={(stepId: string) => deleteManualStep.mutate(stepId)}
                    onOpenLinkDialog={(stepId: string) => setLinkingStepId(stepId)}
                    insertStepAt={insertStepAt}
                    setInsertStepAt={setInsertStepAt}
                    onViewStep={(step: JobStep) => setViewingStep(step)}
                    onDateChange={(stepId: string, newDate: string) => changeMaterialStepDate.mutate({ stepId, newDate })}
                  />
                );
              })}
              {drivers.length === 0 && (
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

        {viewingStep && <StepDetailDialog step={viewingStep} onClose={() => setViewingStep(null)} />}

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








// DispatchPage.tsx 结束
