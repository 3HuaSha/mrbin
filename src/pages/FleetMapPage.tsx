import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayISO, typeMeta } from "@/lib/business";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Truck, ChevronDown, ChevronRight, MapPin, Clock, Loader2, Save, RotateCcw, Plus } from "lucide-react";
import { DispatchMapWidget } from "@/components/DispatchMapWidget";
import { formatETATime, type DriverETA, type ETAResult } from "@/lib/eta-calculator";
import { fetchSamsaraVehicles } from "@/lib/samsara-api";
import { getCachedRouteMatrix, type RouteMatrixEntry } from "@/actions/route-matrix";
import { getFullAddress, MANUAL_STEP_LOCATIONS } from "@/lib/manual-step-locations";
import { toast } from "sonner";
import { BusinessTypeSelector } from "@/components/BusinessTypeSelector";
import { useBusinessType } from "@/lib/business-type-storage";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDispatchData } from "@/hooks/use-dispatch-data";
import { 
  Order, 
  JobStep, 
  Assignment,
  Profile as Driver,
  DriverVehicleAssignment
} from "@/types/dispatch";

// 司机卡片放置区域的 data-* 标识, DispatchMapWidget 会根据它判断拖拽释放位置
export const DRIVER_DROP_ZONE_ATTR = "data-fleet-driver-drop";
// 司机任务列表里的插入位置指示条 data-* 标识
export const DROP_POSITION_ATTR = "data-fleet-drop-position";

const BIN_TYPE_NAMES: Record<string, string> = {
  garbage: '垃圾桶',
  brick: '砖桶',
  soil: '土桶',
  cement: '水泥桶',
  asphalt: '沥青桶',
};

const STEP_TYPE_LABELS: Record<string, string> = {
  pickup_bin: '取桶',
  drop_bin: '放桶',
  dump_waste: '倒垃圾',
  load_material: '装料',
  unload_material: '卸料',
};

const STOP_DURATION_SECONDS = 15 * 60;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
type SavedEtaRow = {
  step_id: string;
  order_id: string | null;
  driver_id: string;
  scheduled_date: string;
  step_number: number;
  eta_at: string;
  eta_min_at: string | null;
  eta_max_at: string | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  source: string | null;
  status: string | null;
  computed_at: string | null;
  payload: Record<string, unknown> | null;
};

export function FleetMapPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());
  const [calculatingDriverId, setCalculatingDriverId] = useState<string | null>(null);
  const [driverETAs, setDriverETAs] = useState<Record<string, DriverETA>>({});
  const [showingETADrivers, setShowingETADrivers] = useState<Set<string>>(new Set());
  const [businessType, setBusinessType] = useBusinessType();
  const [etaNow, setEtaNow] = useState(Date.now());
  
  // 使用封装的数据钩子
  const {
    drivers: filteredDrivers,
    vehicleAssignments,
    orders: allDayOrders,
    assignments: serverAssignmentsData,
    jobSteps,
    commonLocations,
  } = useDispatchData(date, businessType);

  useEffect(() => {
    const timer = setInterval(() => setEtaNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { data: savedEtaRows = [], refetch: refetchSavedEtas } = useQuery({
    queryKey: ["driver-eta-snapshots", date],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("driver_eta_snapshots")
        .select("*")
        .eq("scheduled_date", date)
        .order("driver_id")
        .order("step_number");
      if (error) throw error;
      return (data ?? []) as SavedEtaRow[];
    },
  });

  // 转换 assignments 格式以匹配原有逻辑
  const serverAssignments = useMemo(() => {
    return serverAssignmentsData.map(a => ({
      id: a.id,
      driver_id: a.driver_id,
      order_id: a.order_id,
      sequence: a.sequence,
      orders: a.orders
    }));
  }, [serverAssignmentsData]);

  // 当前被拖拽悬停的司机 (地图告诉我们)
  const [dropHoverDriverId, setDropHoverDriverId] = useState<string | null>(null);
  // 鼠标悬停在司机名字上 (用于高亮路线, 非拖拽)
  const [hoveredDriverId, setHoveredDriverId] = useState<string | null>(null);
  // 地图上点击的订单 id (用于左侧高亮)
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  // 指定的插入位置 (driverId + index)，null 表示插到最后
  const [dropPosition, setDropPosition] = useState<{ driverId: string; index: number } | null>(null);
  // 侧边栏正在被 HTML5 DnD 拖动的订单 id (用于视觉反馈 + hit-test)
  const [sidebarDragOrderId, setSidebarDragOrderId] = useState<string | null>(null);
  // 地图上正在被拖拽的订单 id (从 DispatchMapWidget 回调获取)
  const [mapDragOrderId, setMapDragOrderId] = useState<string | null>(null);

  // 本地草稿: 记录每个订单当前应该属于哪个司机 + 在该司机列表中的位置
  type DraftEntry = { orderId: string; driverId: string | null; index: number };
  const [draft, setDraft] = useState<Record<string, DraftEntry>>({});

  // 手动步骤草稿
  type DraftManualStep = {
    id: string;
    driverId: string;
    location: string;
    stepType: string;
    notes: string;
    index: number;
  };
  const [draftManualSteps, setDraftManualSteps] = useState<DraftManualStep[]>([]);
  const [deleteStepIds, setDeleteStepIds] = useState<string[]>([]);

  // 弹窗: 拖 3445/12441 到司机时需要选择动作和桶大小
  const [locationDropDialog, setLocationDropDialog] = useState<{
    locationId: string;
    driverId: string;
    index?: number;
  } | null>(null);
  const [dialogStepType, setDialogStepType] = useState("");
  const [dialogBinSize, setDialogBinSize] = useState("");

  const hasDraft = Object.keys(draft).length > 0 || draftManualSteps.length > 0 || deleteStepIds.length > 0;

  // 刚展开的司机 id, 用于触发滚动到当前进行中的任务
  const [justExpandedDriverId, setJustExpandedDriverId] = useState<string | null>(null);

  const toggleDriver = (id: string) => {
    const next = new Set(expandedDrivers);
    if (next.has(id)) {
      next.delete(id);
      setJustExpandedDriverId(null);
    } else {
      next.add(id);
      setJustExpandedDriverId(id);
    }
    setExpandedDrivers(next);
  };

  // 展开司机后自动滚动到当前进行中的任务卡片
  useEffect(() => {
    if (!justExpandedDriverId) return;
    // 延迟一帧等 DOM 渲染完成
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-current-step="${justExpandedDriverId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setJustExpandedDriverId(null);
    }, 50);
    return () => clearTimeout(timer);
  }, [justExpandedDriverId]);

  // 拖拽悬停时自动展开司机, 这样用户可以看到任务卡片间的插入位置
  useEffect(() => {
    if (!dropHoverDriverId) return;
    setExpandedDrivers(prev => {
      if (prev.has(dropHoverDriverId)) return prev;
      const next = new Set(prev);
      next.add(dropHoverDriverId);
      return next;
    });
  }, [dropHoverDriverId]);

  const orders = useMemo(() => {
    // 合并已分配订单和全部当日订单 - 这样地图上能看到即使没有分配的订单
    // 排除已完成的订单，不在地图上显示
    const uniqueOrders = new Map<string, Order>();
    // 先加入 jobSteps 里已分配的订单（带司机/状态信息）
    jobSteps.forEach((step: JobStep) => {
      if (step.node_type === 'order' && step.orders) {
        if (step.status === 'done' || step.orders.status === 'done') return;
        uniqueOrders.set(step.orders.id, step.orders);
      }
    });
    // 再补齐未分配的订单
    allDayOrders.forEach((o: Order) => {
      if (o.status === 'done') return;
      if (!uniqueOrders.has(o.id)) {
        uniqueOrders.set(o.id, o);
      }
    });
    return Array.from(uniqueOrders.values());
  }, [jobSteps, allDayOrders]);

  // 订单 id → 订单完整对象 (给地图和任务列表共用的快速查找)
  const orderById = useMemo(() => {
    const m = new Map<string, Order>();
    allDayOrders.forEach((o: Order) => m.set(o.id, o));
    serverAssignments.forEach((a: any) => { if (a.orders) m.set(a.order_id, a.orders as Order); });
    return m;
  }, [allDayOrders, serverAssignments]);

  // 把服务器状态 + 本地 draft 叠加, 得到当前"应当显示"的司机任务排列
  // 返回: { assigned: Record<driverId, orderId[]>, unassigned: orderId[] }
  const merged = useMemo(() => {
    // 初始: 用服务器的分配铺底 (按 sequence 排序)
    const perDriver = new Map<string, { orderId: string; seq: number }[]>();
    const assignedSet = new Set<string>();
    serverAssignments
      .slice()
      .sort((a: any, b: any) => a.sequence - b.sequence)
      .forEach((a: any) => {
        const arr = perDriver.get(a.driver_id) ?? [];
        arr.push({ orderId: a.order_id, seq: a.sequence });
        perDriver.set(a.driver_id, arr);
        assignedSet.add(a.order_id);
      });

    // 然后逐条应用 draft 覆盖
    Object.values(draft).forEach((d: DraftEntry) => {
      // 先把它从所有司机列表里抠出去
      perDriver.forEach((arr) => {
        const idx = arr.findIndex(x => x.orderId === d.orderId);
        if (idx >= 0) arr.splice(idx, 1);
      });
      assignedSet.delete(d.orderId);
      // 再按 draft 要求放回
      if (d.driverId) {
        const arr = perDriver.get(d.driverId) ?? [];
        const clampedIdx = Math.max(0, Math.min(d.index, arr.length));
        arr.splice(clampedIdx, 0, { orderId: d.orderId, seq: -1 });
        perDriver.set(d.driverId, arr);
        assignedSet.add(d.orderId);
      }
    });

    // 输出整理
    const assigned: Record<string, string[]> = {};
    perDriver.forEach((arr, dId) => {
      assigned[dId] = arr.map(x => x.orderId);
    });
    const unassigned = allDayOrders
      .filter((o: Order) => !assignedSet.has(o.id) && o.status !== "done")
      .map((o: Order) => o.id);

    return { assigned, unassigned };
  }, [serverAssignments, allDayOrders, draft]);

  // 给地图用的 assignments 数组 (按合并后的顺序生成 sequence, 排除已完成的)
  const assignments = useMemo(() => {
    const result: Assignment[] = [];
    Object.entries(merged.assigned).forEach(([driverId, orderIds]) => {
      orderIds.forEach((orderId, idx) => {
        const order = orderById.get(orderId);
        if (!order) return;
        // 已完成的订单不在地图上显示
        if (order.status === 'done') return;
        const origStep = jobSteps.find((s: JobStep) => s.node_type === 'order' && s.order_id === orderId && s.driver_id === driverId);
        if (origStep?.status === 'done') return;
        // 找服务器原始 assignment (如果有)
        const existing = serverAssignments.find(
          (a: any) => a.driver_id === driverId && a.order_id === orderId
        );
        result.push({
          id: existing?.id ?? `local-${orderId}`,
          driver_id: driverId,
          order_id: orderId,
          sequence: idx + 1,
          orders: order,
          vehicle_id: '', 
          bin_id: null,
          scheduled_date: date,
          created_at: new Date().toISOString(),
          vehicles: {} as any,
          bins: null,
          dispatch_notes: null
        } as Assignment);
      });
    });
    return result;
  }, [merged.assigned, serverAssignments, orderById, jobSteps, date]);

  // 地图拖拽判断用: 未分配订单 id 列表 (基于本地合并状态)
  const unassignedOrders = useMemo(
    () => merged.unassigned
      .map(id => orderById.get(id))
      .filter((o): o is Order => !!o),
    [merged.unassigned, orderById]
  );

  // 按司机分组任务步骤 (已应用本地 draft: 订单节点部分)
  //   - 手动步骤 (node_type='step') 保持服务器数据
  //   - 订单节点 (node_type='order') 根据 merged.assigned 重新生成, 保证和地图一致
  //   - 本地 draft 手动步骤按 index 插入到正确位置
  const driverJobSteps = useMemo(() => {
    const map: Record<string, JobStep[]> = {};

    // 1. 先按司机收集已有的手动步骤 (排除已标记删除的)
    const existingManualSteps: Record<string, JobStep[]> = {};
    jobSteps.forEach((step: JobStep) => {
      if (step.node_type === 'step' && !deleteStepIds.includes(step.id)) {
        (existingManualSteps[step.driver_id] ??= []).push(step);
      }
    });

    // 2. 按司机构建统一列表: 先把订单节点按 merged 顺序放入, 再把手动步骤插入正确位置
    Object.entries(merged.assigned).forEach(([driverId, orderIds]) => {
      const arr: JobStep[] = [];
      orderIds.forEach((orderId, idx) => {
        const order = orderById.get(orderId);
        if (!order) return;
        const originalStep = jobSteps.find(
          (s: JobStep) => s.node_type === 'order' && s.order_id === orderId && s.driver_id === driverId
        );
        arr.push({
          id: originalStep?.id ?? `draft-${driverId}-${orderId}`,
          driver_id: driverId,
          scheduled_date: date,
          step_number: idx + 1,
          order_id: orderId,
          assignment_id: originalStep?.assignment_id ?? null,
          node_type: 'order',
          location: order.address,
          step_type: originalStep?.step_type ?? 'customer_delivery',
          bin_id: originalStep?.bin_id ?? null,
          notes: originalStep?.notes ?? null,
          status: originalStep?.status ?? 'locked',
          completed_at: originalStep?.completed_at ?? null,
          orders: order,
          created_at: originalStep?.created_at ?? new Date().toISOString(),
        } as JobStep);
      });
      map[driverId] = arr;
    });

    // 3. 把已有的手动步骤按 step_number 插入到对应司机列表中
    //    使用 step_number 来确定相对位置
    Object.entries(existingManualSteps).forEach(([driverId, steps]) => {
      const arr = map[driverId] ??= [];
      steps.forEach(step => {
        // 找到插入位置: step_number 表示它在所有步骤中的位置
        // 插入到第一个 step_number >= 当前 step 的位置之前
        let insertIdx = arr.length; // 默认放末尾
        for (let i = 0; i < arr.length; i++) {
          if (arr[i].step_number >= step.step_number && arr[i].node_type === 'order') {
            insertIdx = i;
            break;
          }
        }
        arr.splice(insertIdx, 0, step);
      });
    });

    // 4. 本地 draft 手动步骤按 index 插入到正确位置
    //    index 表示在该司机列表中的插入位置 (0 = 最前面)
    draftManualSteps.forEach(ms => {
      const arr = map[ms.driverId] ??= [];
      const insertIdx = Math.min(ms.index, arr.length);
      const newStep = {
        id: ms.id,
        driver_id: ms.driverId,
        scheduled_date: date,
        step_number: insertIdx + 1, // 临时编号, 同步时会重新计算
        order_id: null,
        assignment_id: null,
        node_type: 'step',
        location: ms.location,
        step_type: ms.stepType,
        bin_id: null,
        notes: ms.notes || null,
        status: 'locked',
      } as JobStep;
      arr.splice(insertIdx, 0, newStep);
    });

    // 5. 重新编号 step_number (保证连续, 用于 ETA 计算等)
    Object.values(map).forEach(arr => {
      arr.forEach((step, i) => { step.step_number = i + 1; });
    });

    // 确保没有任务的司机也有空数组
    filteredDrivers.forEach((d: Driver) => { map[d.id] ??= []; });

    return map;
  }, [jobSteps, merged.assigned, orderById, date, draftManualSteps, deleteStepIds, filteredDrivers]);

  const savedDriverETAs = useMemo(() => {
    const byDriver = new Map<string, SavedEtaRow[]>();
    savedEtaRows.forEach((row) => {
      const list = byDriver.get(row.driver_id) ?? [];
      list.push(row);
      byDriver.set(row.driver_id, list);
    });

    const result: Record<string, DriverETA> = {};
    byDriver.forEach((rows, driverId) => {
      const driver = filteredDrivers.find((item: Driver) => item.id === driverId);
      result[driverId] = {
        driverId,
        driverName: driver?.name ?? "司机",
        vehicleId: "",
        samsaraVehicleId: "",
        currentLocation: null,
        orders: rows
          .slice()
          .sort((a, b) => a.step_number - b.step_number)
          .map((row) => ({
            orderId: row.order_id || row.step_id,
            stepId: row.step_id,
            orderAddress: String(row.payload?.orderAddress || ""),
            distance: row.distance_meters || 0,
            duration: row.duration_seconds || 0,
            source: (row.source as ETAResult["source"]) || "cache",
            eta: row.eta_at,
            status: row.status === "ERROR" ? "ERROR" as const : "OK" as const,
          })),
        totalDistance: rows.reduce((sum, row) => sum + (row.distance_meters || 0), 0),
        totalDuration: rows.reduce((sum, row) => sum + (row.duration_seconds || 0), 0),
        lastUpdated: rows[0]?.computed_at || new Date().toISOString(),
      };
    });
    return result;
  }, [filteredDrivers, savedEtaRows]);

  const displayDriverETAs = useMemo(() => {
    const mergedETAs = { ...savedDriverETAs, ...driverETAs };
    const result: Record<string, DriverETA> = {};

    Object.entries(mergedETAs).forEach(([driverId, eta]) => {
      const steps = (driverJobSteps[driverId] ?? []).slice().sort((a, b) => a.step_number - b.step_number);
      if (!steps.length) {
        result[driverId] = eta;
        return;
      }

      result[driverId] = {
        ...eta,
        orders: eta.orders.map((orderEta) => {
          const step = steps.find((item) => stepEtaId(item) === orderEta.orderId || item.id === orderEta.stepId);
          if (!step) return orderEta;
          return findStepETA(eta, step, steps, etaNow) ?? orderEta;
        }),
      };
    });

    return result;
  }, [driverETAs, driverJobSteps, etaNow, savedDriverETAs]);

  const driverExecutionSummaries = useMemo(() => {
    return filteredDrivers.map((driver: Driver) => {
      const steps = (driverJobSteps[driver.id] ?? [])
        .slice()
        .sort((a, b) => a.step_number - b.step_number);
      const activeSteps = steps.filter((step) => step.status !== "done");
      const nextStep = activeSteps[0] ?? null;
      const lastDone = steps
        .filter((step) => step.status === "done")
        .sort((a, b) => b.step_number - a.step_number)[0] ?? null;
      const driverETA = displayDriverETAs[driver.id];
      const nextEta = nextStep ? findStepETA(driverETA, nextStep, steps, etaNow) : null;
      const etaRange = nextEta?.status === "OK" ? formatEtaRange(nextEta.eta, nextStep) : null;
      const upcoming = activeSteps.map((step) => ({
        step,
        eta: findStepETA(driverETA, step, steps, etaNow),
      }));

      return {
        driver,
        steps,
        nextStep,
        lastDone,
        driverETA,
        nextEta,
        etaRange,
        upcoming,
      };
    });
  }, [etaNow, filteredDrivers, driverJobSteps, displayDriverETAs]);

  // 拖拽预览路线: 当拖拽订单悬停在司机上时, 计算该司机现有任务 + 新订单的路线坐标
  // 使用 localStorage 中的 geocode 缓存 + MANUAL_STEP_LOCATIONS 的固定坐标
  const previewRoute = useMemo(() => {
    // 需要同时有: 悬停的司机 + 正在拖拽的订单
    if (!dropHoverDriverId) return null;
    // 拖拽来源: 地图拖拽时 sidebarDragOrderId 为 null, 但 dropHoverDriverId 有值
    // 侧边栏拖拽时 sidebarDragOrderId 有值
    // 两种情况都需要显示预览路线

    // 获取 geocode 缓存
    let geocodeCache: Record<string, { lat: number; lng: number }> = {};
    try {
      const today = new Date().toISOString().slice(0, 10);
      const raw = localStorage.getItem('geocode-cache');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed._date === today) {
          const { _date, ...rest } = parsed;
          geocodeCache = rest;
        }
      }
    } catch {}

    // 辅助: 根据地址获取坐标
    const getCoords = (address: string | null): { lat: number; lng: number } | null => {
      if (!address) return null;
      // 先查固定地点
      const manualLoc = MANUAL_STEP_LOCATIONS.find(loc =>
        loc.shortName.toLowerCase() === address.toLowerCase() ||
        loc.fullAddress.toLowerCase() === address.toLowerCase() ||
        address.toLowerCase().includes(loc.shortName.toLowerCase())
      );
      if (manualLoc) return manualLoc.coordinates;
      // 再查 geocode 缓存
      const geoAddr = address.toLowerCase().includes('on') ? address : `${address}, Toronto, ON, Canada`;
      if (geocodeCache[geoAddr]) return geocodeCache[geoAddr];
      if (geocodeCache[address]) return geocodeCache[address];
      // 尝试模糊匹配
      const lowerAddr = address.toLowerCase();
      for (const [key, val] of Object.entries(geocodeCache)) {
        if (key.toLowerCase().includes(lowerAddr) || lowerAddr.includes(key.toLowerCase())) {
          return val;
        }
      }
      return null;
    };

    // 收集该司机现有任务的坐标 (按顺序)
    const driverSteps = driverJobSteps[dropHoverDriverId] ?? [];
    const routePoints: { lat: number; lng: number }[] = [];

    driverSteps.forEach(step => {
      const addr = step.node_type === 'order' && step.orders
        ? step.orders.address
        : step.location;
      const coords = getCoords(addr);
      if (coords) routePoints.push(coords);
    });

    // 如果正在拖拽一个订单, 把它的坐标也加到预览路线中
    // sidebarDragOrderId 是侧边栏拖拽的订单 id
    // mapDragOrderId 是地图上拖拽的订单 id
    const draggingOrderId = (sidebarDragOrderId && !sidebarDragOrderId.startsWith("step:")
      ? sidebarDragOrderId
      : null) || mapDragOrderId;
    if (draggingOrderId) {
      const order = orderById.get(draggingOrderId);
      if (order) {
        const coords = getCoords(order.address);
        if (coords) {
          // 如果有指定插入位置, 插入到对应位置; 否则加到末尾
          if (dropPosition && dropPosition.driverId === dropHoverDriverId) {
            routePoints.splice(dropPosition.index, 0, coords);
          } else {
            routePoints.push(coords);
          }
        }
      }
    }

    // 至少需要 2 个点才能画线
    if (routePoints.length < 2) return null;
    return routePoints;
  }, [dropHoverDriverId, sidebarDragOrderId, mapDragOrderId, driverJobSteps, orderById, dropPosition]);

  // 悬停司机名字时的路线高亮: 把该司机所有任务点连线
  const hoverRoute = useMemo((): { lat: number; lng: number }[] | null => {
    if (!hoveredDriverId) return null;

    let geocodeCache: Record<string, { lat: number; lng: number }> = {};
    try {
      const today = new Date().toISOString().slice(0, 10);
      const raw = localStorage.getItem('geocode-cache');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed._date === today) {
          const { _date, ...rest } = parsed;
          geocodeCache = rest;
        }
      }
    } catch { /* ignore */ }

    const getCoords = (address: string | null): { lat: number; lng: number } | null => {
      if (!address) return null;
      const manualLoc = MANUAL_STEP_LOCATIONS.find(loc =>
        loc.shortName.toLowerCase() === address.toLowerCase() ||
        loc.fullAddress.toLowerCase() === address.toLowerCase() ||
        address.toLowerCase().includes(loc.shortName.toLowerCase())
      );
      if (manualLoc) return manualLoc.coordinates;
      const geoAddr = address.toLowerCase().includes('on') ? address : `${address}, Toronto, ON, Canada`;
      if (geocodeCache[geoAddr]) return geocodeCache[geoAddr];
      if (geocodeCache[address]) return geocodeCache[address];
      const lowerAddr = address.toLowerCase();
      for (const [key, val] of Object.entries(geocodeCache)) {
        if (key.toLowerCase().includes(lowerAddr) || lowerAddr.includes(key.toLowerCase())) {
          return val;
        }
      }
      return null;
    };

    const steps = driverJobSteps[hoveredDriverId] ?? [];
    const points: { lat: number; lng: number }[] = [];
    steps.forEach(step => {
      const addr = step.node_type === 'order' && step.orders ? step.orders.address : step.location;
      const coords = getCoords(addr);
      if (coords) points.push(coords);
    });
    return points.length >= 2 ? points : null;
  }, [hoveredDriverId, driverJobSteps]);

  // 当天砖业务订单涉及的砖厂 id 集合 (砖业务时只显示有单的砖厂)
  // 如果没有匹配到任何砖厂, 则显示所有砖厂 (避免空地图)
  const activeBrickFactoryIds = useMemo((): Set<string> => {
    if (businessType !== 'brick') return new Set<string>();
    const ids = new Set<string>();
    const brickFactories = MANUAL_STEP_LOCATIONS.filter(l => l.type === 'brick_factory');
    allDayOrders.forEach(order => {
      const addr = (order.address || '').toUpperCase();
      brickFactories.forEach(factory => {
        if (addr.includes(factory.shortName.toUpperCase()) ||
            factory.shortName.toUpperCase().includes(addr) ||
            factory.fullAddress.toUpperCase().includes(addr)) {
          ids.add(factory.id);
        }
      });
    });
    jobSteps.forEach((step: JobStep) => {
      const loc = (step.location || '').toUpperCase();
      brickFactories.forEach(factory => {
        if (loc.includes(factory.shortName.toUpperCase()) ||
            factory.shortName.toUpperCase().includes(loc)) {
          ids.add(factory.id);
        }
      });
    });
    // 没有匹配到任何砖厂就不显示
    return ids;
  }, [businessType, allDayOrders, jobSteps]);

  // 地图点击订单时, 自动展开对应司机并滚动到该订单卡片
  useEffect(() => {
    if (!highlightedOrderId) return;
    const driverId = Object.entries(driverJobSteps).find(([, steps]) =>
      steps.some(s => s.node_type === 'order' && s.order_id === highlightedOrderId)
    )?.[0];
    if (driverId) {
      setExpandedDrivers(prev => {
        if (prev.has(driverId)) return prev;
        const next = new Set(prev);
        next.add(driverId);
        return next;
      });
    }
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-order-id="${highlightedOrderId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    const clearTimer = setTimeout(() => setHighlightedOrderId(null), 3000);
    return () => { clearTimeout(timer); clearTimeout(clearTimer); };
  }, [highlightedOrderId, driverJobSteps]);

  // 本地拖拽: 更新 draft. 不立即写库.
  //   orderId 可以是订单 id 或 "step:xxx" 格式的手动步骤 id
  //   driverId = null → 取消分配
  //   driverId = 'xxx' → 放到该司机的 index 位置 (index undefined 时放最后)
  //   index 是统一列表中的位置 (包含订单和手动步骤)
  const stageAssignment = (orderId: string, driverId: string | null, index?: number) => {
    // 如果是手动步骤的拖拽重排
    if (orderId.startsWith("step:")) {
      const stepId = orderId.slice(5);
      if (driverId === null) {
        // 拖到地图 = 删除 (已在 onDrop 处理)
        return;
      }
      // 手动步骤重排: 更新 draftManualSteps 的 index 或已有步骤的 step_number
      const isDraftStep = stepId.startsWith("draft-step-");
      if (isDraftStep) {
        // 更新 draft 步骤的 index
        setDraftManualSteps(prev => {
          const stepIdx = prev.findIndex(s => s.id === stepId);
          if (stepIdx < 0) return prev;
          const updated = [...prev];
          const [moved] = updated.splice(stepIdx, 1);
          moved.driverId = driverId;
          moved.index = index ?? 999;
          return [...updated, moved];
        });
      } else {
        // 已有步骤: 需要更新 step_number, 暂时通过 deleteStepIds + draftManualSteps 实现
        const existingStep = jobSteps.find((s: JobStep) => s.id === stepId);
        if (existingStep) {
          // 标记旧的为删除
          setDeleteStepIds(prev => prev.includes(stepId) ? prev : [...prev, stepId]);
          // 创建新的 draft 步骤在目标位置
          const newDraft: DraftManualStep = {
            id: `draft-step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            driverId,
            location: existingStep.location || '',
            stepType: existingStep.step_type,
            notes: existingStep.notes || '',
            index: index ?? 999,
          };
          setDraftManualSteps(prev => [...prev, newDraft]);
        }
      }
      return;
    }

    setDraft(prev => {
      const next = { ...prev };

      // DropIndicator 提供的是统一列表的 index（包含订单和手动步骤，且只数未完成/未删除的可见节点）
      // 需要把它换算为订单序列中的 index（手动步骤不计入订单序列）
      let targetIndex = 0;
      if (driverId && index !== undefined) {
        const visibleSteps = (driverJobSteps[driverId] ?? []).filter(s => {
          if (s.node_type === 'order') return s.status !== 'done' && s.orders?.status !== 'done';
          // 手动步骤：过滤掉标记删除或已完成
          if (s.node_type === 'step') return !deleteStepIds.includes(s.id) && s.status !== 'done';
          return false;
        });
        let orderCount = 0;
        for (let i = 0; i < Math.min(index, visibleSteps.length); i++) {
          const node = visibleSteps[i];
          if (node.node_type === 'order' && node.order_id !== orderId) orderCount++;
        }
        targetIndex = orderCount;
      } else if (driverId && index === undefined) {
        const currentList = merged.assigned[driverId] ?? [];
        targetIndex = currentList.filter(id => id !== orderId).length;
      }

      // 检查是否与"服务器当前状态"一致 → 是的话把 draft 条目清掉, 避免 pending 变更堆积
      const serverCurrent = serverAssignments.find(a => a.order_id === orderId);
      const serverDriverId = serverCurrent?.driver_id ?? null;
      let serverIndex: number | null = null;
      if (serverCurrent) {
        const serverSiblings = serverAssignments
          .filter(a => a.driver_id === serverCurrent.driver_id)
          .sort((a, b) => a.sequence - b.sequence);
        serverIndex = serverSiblings.findIndex(a => a.order_id === orderId);
      }

      if (driverId === serverDriverId && driverId !== null && targetIndex === serverIndex) {
        delete next[orderId];
      } else if (driverId === null && serverDriverId === null) {
        delete next[orderId];
      } else {
        next[orderId] = { orderId, driverId, index: targetIndex };
      }
      return next;
    });
  };

  // 放弃本地改动
  const discardDraft = () => {
    setDraft({});
    setDraftManualSteps([]);
    setDeleteStepIds([]);
    setDropPosition(null);
    toast.message("已撤销未同步的改动");
  };

  // 地图固定地点拖到司机: 根据地点类型决定是直接创建步骤还是弹窗
  const handleLocationDrop = (locationId: string, driverId: string, index?: number) => {
    const loc = MANUAL_STEP_LOCATIONS.find(l => l.id === locationId);
    if (!loc) return;

    // 3445: 可以倒垃圾/放桶/拿桶 → 弹窗
    if (locationId === '3445') {
      setLocationDropDialog({ locationId, driverId, index });
      setDialogStepType("");
      setDialogBinSize("");
      return;
    }
    // 12441: 只能放桶/拿桶 → 弹窗
    if (locationId === '12441') {
      setLocationDropDialog({ locationId, driverId, index });
      setDialogStepType("");
      setDialogBinSize("");
      return;
    }
    // 其他垃圾场/转运站: 直接创建"倒垃圾"步骤, 不需要选桶大小
    const newStep: DraftManualStep = {
      id: `draft-step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      driverId,
      location: loc.shortName,
      stepType: "dump_waste",
      notes: "",
      index: index ?? 999,
    };
    setDraftManualSteps(prev => [...prev, newStep]);
    toast.success(`已添加"倒垃圾 → ${loc.shortName}"步骤 (待同步)`);
  };

  // 弹窗确认: 创建手动步骤
  const confirmLocationDrop = () => {
    if (!locationDropDialog) return;
    if (!dialogStepType) { toast.error("请选择动作"); return; }
    if ((dialogStepType === "pickup_bin" || dialogStepType === "drop_bin") && !dialogBinSize) {
      toast.error("请选择桶大小"); return;
    }
    const loc = MANUAL_STEP_LOCATIONS.find(l => l.id === locationDropDialog.locationId);
    if (!loc) return;

    const notes = dialogBinSize ? `${dialogBinSize}yd` : "";
    const newStep: DraftManualStep = {
      id: `draft-step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      driverId: locationDropDialog.driverId,
      location: loc.shortName,
      stepType: dialogStepType,
      notes,
      index: locationDropDialog.index ?? 999,
    };
    setDraftManualSteps(prev => [...prev, newStep]);
    setLocationDropDialog(null);
    setDialogStepType("");
    setDialogBinSize("");
    const stepLabel = dialogStepType === "dump_waste" ? "倒垃圾" : dialogStepType === "pickup_bin" ? "取桶" : "放桶";
    toast.success(`已添加"${stepLabel} → ${loc.shortName}"步骤 (待同步)`);
  };

  // 同步: 按 draft 计算出要新增/更新/删除的 assignments, 批量写库
  const syncDraft = useMutation({
    mutationFn: async () => {
      const entries = Object.values(draft);
      if (entries.length === 0 && draftManualSteps.length === 0 && deleteStepIds.length === 0) {
        return { created: 0, deleted: 0, reordered: 0, manualSteps: 0, deletedSteps: 0 };
      }

      // 1. 取消分配: draft 里 driverId=null 且原本有分配 → 删除 dispatch_assignment
      const toDelete: string[] = [];
      // 2. 新建或移动: driverId 非 null → 若原来没有 assignment 就 INSERT; 若有但司机变了, 也需要删旧建新 (简化处理)
      const toInsert: Array<{ orderId: string; driverId: string; sequence: number }> = [];
      // 3. reorder: 仅同司机顺序变 → UPDATE sequence
      const toReorder: Array<{ id: string; sequence: number; driverId: string }> = [];

      // 收集每个司机合并后的完整顺序, 统一重写 sequence
      const targetOrder: Record<string, string[]> = merged.assigned;
      const driverIdsInvolved = new Set<string>();
      entries.forEach(e => {
        if (e.driverId) driverIdsInvolved.add(e.driverId);
        const orig = serverAssignments.find(a => a.order_id === e.orderId);
        if (orig) driverIdsInvolved.add(orig.driver_id);
      });

      for (const e of entries) {
        const serverCurrent = serverAssignments.find(a => a.order_id === e.orderId);
        if (e.driverId === null) {
          // 取消分配
          if (serverCurrent) toDelete.push(serverCurrent.id);
        } else if (!serverCurrent) {
          // 新建
          const seq = (targetOrder[e.driverId] ?? []).indexOf(e.orderId) + 1;
          toInsert.push({ orderId: e.orderId, driverId: e.driverId, sequence: seq });
        } else if (serverCurrent.driver_id !== e.driverId) {
          // 换司机: 删旧建新 (简化处理)
          toDelete.push(serverCurrent.id);
          const seq = (targetOrder[e.driverId] ?? []).indexOf(e.orderId) + 1;
          toInsert.push({ orderId: e.orderId, driverId: e.driverId, sequence: seq });
        }
      }

      // 同司机内的 reorder: 遍历每位涉及的司机的最终 order, 对保留下来的 assignments 更新 sequence
      driverIdsInvolved.forEach(dId => {
        const order = targetOrder[dId] ?? [];
        order.forEach((orderId, idx) => {
          const seq = idx + 1;
          const existing = serverAssignments.find(
            a => a.driver_id === dId && a.order_id === orderId
          );
          if (existing && !toDelete.includes(existing.id) && existing.sequence !== seq) {
            toReorder.push({ id: existing.id, sequence: seq, driverId: dId });
          }
        });
      });

      // --- 执行 ---
      // 1. 删除 (级联会删 job_steps)
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from("dispatch_assignments")
          .delete()
          .in("id", toDelete);
        if (error) throw error;
      }

      // 2. 插入
      const stepTypeMap: Record<string, string> = {
        delivery: "customer_delivery",
        pickup: "customer_pickup",
        swap: "customer_delivery",
        material: "unload_material",
      };
      for (const ins of toInsert) {
        const order = orderById.get(ins.orderId);
        if (!order) continue;
        const vAssign = vehicleAssignments.find((a: any) => a.driver_id === ins.driverId);
        if (!vAssign?.vehicle_id) {
          throw new Error(`司机未绑定车辆, 无法分配`);
        }
        const { data: newAsg, error: aErr } = await supabase
          .from("dispatch_assignments")
          .insert({
            order_id: ins.orderId,
            driver_id: ins.driverId,
            vehicle_id: vAssign.vehicle_id,
            scheduled_date: date,
            sequence: ins.sequence,
          })
          .select()
          .single();
        if (aErr) throw aErr;

        // 补 job_steps 订单节点 (触发器生成的是 depot_pickup/customer_delivery 等流水步骤,
        // 但 FleetMap / 司机 APP 依赖 node_type='order' 节点)
        const { error: sErr } = await supabase.from("job_steps").insert({
          assignment_id: newAsg.id,
          driver_id: ins.driverId,
          scheduled_date: date,
          order_id: ins.orderId,
          node_type: "order",
          step_number: ins.sequence,
          step_type: (stepTypeMap[order.type] || "customer_delivery") as any,
          location: order.address,
          status: "locked",
        });
        if (sErr) {
          console.warn("job_steps 订单节点插入失败 (可能已由触发器创建):", sErr.message);
        }
      }

      // 3. 更新 sequence (同步更新 order 节点的 step_number)
      for (const u of toReorder) {
        await supabase
          .from("dispatch_assignments")
          .update({ sequence: u.sequence })
          .eq("id", u.id);
        await supabase
          .from("job_steps")
          .update({ step_number: u.sequence })
          .eq("assignment_id", u.id)
          .eq("node_type", "order");
      }

      // 4. 插入手动步骤 (draftManualSteps) - 按 index 插入到正确位置
      for (const ms of draftManualSteps) {
        // 获取该司机当天所有步骤 (包括刚插入的)
        const { data: existingSteps } = await supabase
          .from("job_steps")
          .select("id, step_number")
          .eq("driver_id", ms.driverId)
          .eq("scheduled_date", date)
          .order("step_number", { ascending: true });

        const allSteps = existingSteps || [];
        // 计算插入位置: index 是统一列表中的位置
        const targetStepNum = Math.min(ms.index + 1, allSteps.length + 1);

        // 把目标位置及之后的步骤编号都 +1
        const stepsToShift = allSteps.filter(s => s.step_number >= targetStepNum);
        for (const s of stepsToShift.reverse()) {
          await supabase.from("job_steps")
            .update({ step_number: s.step_number + 1 })
            .eq("id", s.id);
        }

        const { error: msErr } = await supabase.from("job_steps").insert({
          driver_id: ms.driverId,
          scheduled_date: date,
          step_number: targetStepNum,
          node_type: "step",
          location: ms.location,
          step_type: ms.stepType as any,
          notes: ms.notes || null,
          status: "locked",
        });
        if (msErr) throw msErr;
      }

      // 5. 删除手动步骤 (拖到地图上的)
      if (deleteStepIds.length > 0) {
        const { error: delErr } = await supabase
          .from("job_steps")
          .delete()
          .in("id", deleteStepIds);
        if (delErr) throw delErr;
      }

      return { created: toInsert.length, deleted: toDelete.length, reordered: toReorder.length, manualSteps: draftManualSteps.length, deletedSteps: deleteStepIds.length };
    },
    onSuccess: (res) => {
      setDraft({});
      setDraftManualSteps([]);
      setDeleteStepIds([]);
      setDropPosition(null);
      const parts: string[] = [];
      if (res.created) parts.push(`新增 ${res.created}`);
      if (res.deleted) parts.push(`取消 ${res.deleted}`);
      if (res.reordered) parts.push(`重排 ${res.reordered}`);
      if (res.manualSteps) parts.push(`手动步骤 +${res.manualSteps}`);
      if (res.deletedSteps) parts.push(`删除步骤 ${res.deletedSteps}`);
      toast.success(`同步成功: ${parts.join(" · ") || "无改动"}`);
      qc.invalidateQueries({ queryKey: ["map-job-steps"] });
      qc.invalidateQueries({ queryKey: ["map-all-orders"] });
      qc.invalidateQueries({ queryKey: ["dispatch-assignments"] });
      qc.invalidateQueries({ queryKey: ["dispatch-orders"] });
      qc.invalidateQueries({ queryKey: ["job-steps"] });
    },
    onError: (e: Error) => toast.error(`同步失败: ${e.message}`),
  });

  // 计算单个司机的 ETA
  const handleCalculateDriverETA = async (driverId: string, driverName: string) => {
    const calculationStartedAt = Date.now();
    setEtaNow(calculationStartedAt);
    setCalculatingDriverId(driverId);
    try {
      // 获取 Samsara 车辆位置
      const samsaraResult = await fetchSamsaraVehicles();
      if (!samsaraResult.success) {
        toast.error('无法获取车辆位置');
        return;
      }

      // 获取车辆分配信息
      const { data: vAssignments } = await supabase
        .from("driver_vehicle_assignments")
        .select(`
          driver_id,
          vehicle_id,
          profiles!driver_vehicle_assignments_driver_id_fkey(name),
          vehicles!driver_vehicle_assignments_vehicle_id_fkey(name, samsara_id)
        `);

      const driverSteps = (driverJobSteps[driverId] ?? []).filter((step) => step.status !== 'done');
      
      // 包含所有步骤（订单节点 + 手动步骤节点）
      const allSteps = driverSteps.map(s => {
        if (s.node_type === 'order' && s.orders) {
          return {
            id: s.orders.id,
            stepId: s.id,
            orderId: s.orders.id,
            address: s.orders.address,
            type: 'order' as const,
            stepNumber: s.step_number
          };
        } else if (s.node_type === 'step' && s.location) {
          // 对于手动步骤，使用完整地址
          return {
            id: s.id,
            stepId: s.id,
            orderId: null,
            address: getFullAddress(s.location), // 转换为完整地址
            type: 'manual' as const,
            stepNumber: s.step_number
          };
        }
        return null;
      }).filter(Boolean).sort((a, b) => a!.stepNumber - b!.stepNumber);
      
      if (allSteps.length === 0) {
        toast.error('该司机没有任务');
        return;
      }

      // 找到司机的车辆
      const assignment = (vAssignments as any[])?.find((a: any) => a.driver_id === driverId);
      if (!assignment) {
        toast.error('未找到司机的车辆分配');
        return;
      }

      const samsaraVehicleId = assignment.vehicles?.samsara_id;
      if (!samsaraVehicleId) {
        toast.error('车辆没有 Samsara ID');
        return;
      }

      // 找到车辆的实时位置
      const vehicle = (samsaraResult.data as any[]).find(v => v.id === samsaraVehicleId);
      if (!vehicle || !vehicle.location) {
        toast.error('无法获取车辆位置');
        return;
      }

      const currentLocation = {
        lat: vehicle.location.latitude,
        lng: vehicle.location.longitude,
      };

      // 准备所有步骤数据（包含订单和手动步骤）
      const stepsForETA = allSteps.map(s => ({
        id: s!.id,
        stepId: s!.stepId,
        orderId: s!.orderId,
        address: normalizeEtaAddress(s!.address),
      }));

      const currentAddress = `${currentLocation.lat},${currentLocation.lng}`;
      const routeAddresses = [currentAddress, ...stepsForETA.map((step) => step.address)];
      const routePairs = routeAddresses.slice(1).map((address, index) => ({
        from: routeAddresses[index],
        to: address,
      }));
      const matrix = await getCachedRouteMatrix({ data: { addresses: routeAddresses, pairs: routePairs } });
      if (!matrix.success) throw new Error(matrix.error || "Matrix ETA calculation failed");

      const eta = buildDriverETAFromMatrix({
        driverId,
        driverName,
        vehicleId: assignment.vehicle_id,
        samsaraVehicleId,
        currentLocation,
        currentAddress,
        steps: stepsForETA,
        entries: matrix.entries,
        nowMs: calculationStartedAt,
      });

      console.log('✅ ETA 计算结果:', {
        driverId,
        driverName,
        stepsCount: eta.orders.length,
        steps: eta.orders.map(o => ({
          id: o.orderId,
          address: o.orderAddress,
          eta: o.eta,
          status: o.status
        }))
      });

      setDriverETAs(prev => ({ ...prev, [driverId]: eta }));
      setShowingETADrivers(prev => new Set(prev).add(driverId)); // 标记为显示
      try {
        await saveDriverETASnapshot({
          driverId,
          scheduledDate: date,
          eta,
          steps: driverSteps,
        });
        refetchSavedEtas();
      } catch (saveError) {
        console.warn("保存 ETA 快照失败:", saveError);
        toast.warning("ETA 已计算，但保存到数据库失败");
      }
      toast.success(`${driverName} 的 ETA 计算完成`);
    } catch (error) {
      console.error('计算 ETA 失败:', error);
      toast.error('计算 ETA 失败');
    } finally {
      setCalculatingDriverId(null);
    }
  };

  return (
    <div className="p-0 h-screen flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <h1 className="text-xl font-bold">车队地图</h1>
        <BusinessTypeSelector value={businessType} onChange={setBusinessType} />
      </div>
      
      <div className="flex-1 flex min-h-0">
        {/* 左侧司机任务列表 - 缩小宽度 */}
        <Card className="w-80 flex flex-col overflow-hidden shrink-0 shadow-sm rounded-none border-r border-t-0 border-l-0 border-b-0">
          <div className="p-3 border-b bg-muted/20 font-semibold text-sm flex items-center gap-2 shrink-0">
            <Truck className="h-4 w-4" />
            司机执行与任务 ({filteredDrivers.length})
          </div>

          {/* 同步按钮 - 有未保存改动时高亮 */}
          <div className="p-2 border-b bg-background shrink-0 flex gap-2">
            <Button
              size="sm"
              variant={hasDraft ? "default" : "outline"}
              onClick={() => syncDraft.mutate()}
              disabled={!hasDraft || syncDraft.isPending}
              className="flex-1 h-8 text-xs"
            >
              {syncDraft.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Save className="h-3 w-3 mr-1" />
              )}
              {hasDraft ? `同步 (${Object.keys(draft).length})` : "同步"}
            </Button>
            {hasDraft && (
              <Button
                size="sm"
                variant="ghost"
                onClick={discardDraft}
                disabled={syncDraft.isPending}
                className="h-8 px-2 text-xs"
                title="撤销未同步的改动"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* 日期选择器 */}
          <div className="p-3 border-b bg-background shrink-0">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-9 px-3 rounded-md border bg-background text-sm"
            />
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {filteredDrivers.map((d: Driver) => {
              const steps = driverJobSteps[d.id] ?? [];
              const isExpanded = expandedDrivers.has(d.id);
              const execution = driverExecutionSummaries.find((item) => item.driver.id === d.id);
              const nextStep = execution?.nextStep ?? null;
              const nextEta = execution?.nextEta ?? null;
              const etaRange = execution?.etaRange ?? null;
              const hasEta = !!execution?.driverETA;
              const isLateRisk = nextEta?.status === "OK" && etaRange?.risk;
              
              return (
                <div
                  key={d.id}
                  {...{ [DRIVER_DROP_ZONE_ATTR]: d.id }}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes("text/plain")) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      // 悬停时自动展开 + 高亮 (与地图拖拽一致)
                      if (dropHoverDriverId !== d.id) setDropHoverDriverId(d.id);
                    }
                  }}
                  onDragLeave={(e) => {
                    // 仅在真的离开卡片 (而不是进入子元素) 时取消
                    const related = e.relatedTarget as Node | null;
                    if (related && (e.currentTarget as Node).contains(related)) return;
                    if (dropHoverDriverId === d.id) setDropHoverDriverId(null);
                  }}
                  onDrop={(e) => {
                    // 如果没落在具体的 DropIndicator 上, 就放到末尾
                    e.preventDefault();
                    const raw = e.dataTransfer.getData("text/plain");
                    if (!raw) return;
                    // 支持手动步骤和订单的拖拽
                    stageAssignment(raw, d.id);
                    setDropHoverDriverId(null);
                  }}
                  className={`border rounded-md overflow-hidden bg-card transition-all ${
                    dropHoverDriverId === d.id
                      ? "ring-2 ring-primary shadow-lg scale-[1.02] border-primary"
                      : ""
                  } ${isLateRisk ? "border-destructive/60 bg-destructive/5" : hasEta ? "border-blue-200" : ""}`}
                >
                  <div 
                    className="p-2 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => toggleDriver(d.id)}
                    onMouseEnter={() => setHoveredDriverId(d.id)}
                    onMouseLeave={() => setHoveredDriverId(null)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm flex items-center gap-2 min-w-0">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0"/> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0"/>}
                        <span className="truncate">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={isLateRisk ? "destructive" : hasEta ? "default" : "secondary"} className="text-[10px]">
                        {isLateRisk ? "晚到风险" : hasEta ? "ETA" : steps.length}
                      </Badge>
                      <Button
                        size="sm"
                        variant={showingETADrivers.has(d.id) ? "default" : "ghost"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCalculateDriverETA(d.id, d.name);
                        }}
                        disabled={calculatingDriverId === d.id}
                        className="h-6 w-6 p-0"
                        title="重新计算 ETA"
                      >
                        {calculatingDriverId === d.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                      </Button>
                      </div>
                    </div>

                    <div className="mt-2 pl-6">
                      {nextStep ? (
                        <>
                          <div className={cx(
                            "rounded-md border px-2 py-1.5",
                            isLateRisk
                              ? "border-destructive/30 bg-destructive/10"
                              : hasEta
                              ? "border-blue-200 bg-blue-50/70"
                              : "border-border bg-muted/30"
                          )}>
                            <div className="flex items-start gap-2">
                              <div className={cx(
                                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                                isLateRisk ? "bg-destructive text-destructive-foreground" : hasEta ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
                              )}>
                                {isLateRisk ? <AlertTriangle className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                                      {hasEta ? "下一站" : "待计算 ETA"}
                                    </div>
                                    <div className="truncate text-[11px] font-semibold leading-snug">
                                      {stepActionLabel(nextStep)}
                                    </div>
                                  </div>
                                  {nextEta?.status === "OK" && etaRange && (
                                    <div className={cx(
                                      "shrink-0 rounded-md px-1.5 py-1 text-right leading-none",
                                      isLateRisk ? "bg-destructive text-destructive-foreground" : "bg-blue-600 text-white"
                                    )}>
                                      <div className="text-[9px] opacity-85">ETA</div>
                                      <div className="text-[12px] font-bold tabular-nums">{formatETATime(nextEta.eta)}</div>
                                    </div>
                                  )}
                                </div>
                                <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={stepLocationLabel(nextStep)}>
                                  {stepLocationLabel(nextStep)}
                                </div>
                                {nextEta?.status === "OK" && etaRange && (
                                  <div className={cx("mt-1 text-[10px]", isLateRisk ? "text-destructive" : "text-blue-700")}>
                                    合理范围 {etaRange.label}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {hasEta && (execution?.upcoming?.length || 0) > 1 && (
                            <div className="mt-1.5 overflow-hidden rounded-md border bg-background">
                              <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5">
                                {execution?.upcoming.map(({ step, eta }, index) => (
                                  <React.Fragment key={step.id}>
                                    {index > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
                                    <div className="min-w-[54px] shrink-0">
                                      <div className="truncate text-[8px] text-muted-foreground">
                                        {stepActionLabel(step)}
                                      </div>
                                      <div className={cx(
                                        "mt-0.5 rounded px-1 py-0.5 text-center text-[10px] font-semibold tabular-nums",
                                        eta?.status === "OK" ? "bg-slate-100 text-slate-700" : "bg-muted text-muted-foreground"
                                      )}>
                                        {eta?.status === "OK" ? formatETATime(eta.eta) : "--:--"}
                                      </div>
                                    </div>
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-[10px] text-muted-foreground">
                          今天任务已完成
                        </div>
                      )}
                    </div>

                    {false && (
                      <>
                      {nextStep ? (
                        <>
                          <div className="flex items-center gap-1 text-[11px] leading-snug">
                            <span className="text-muted-foreground">去</span>
                            <span className="font-medium truncate">{stepActionLabel(nextStep)}</span>
                            {isLateRisk && <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground" title={stepLocationLabel(nextStep)}>
                            {stepLocationLabel(nextStep)}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {nextEta?.status === "OK" && etaRange ? (
                              <>
                                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                  预计 {formatETATime(nextEta.eta)}
                                </span>
                                <span className="text-[10px] text-muted-foreground">合理 {etaRange.label}</span>
                              </>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">点时钟计算 ETA</span>
                            )}
                          </div>
                          {hasEta && (execution?.upcoming?.length || 0) > 1 && (
                            <div className="mt-1 rounded border bg-background/70 px-1.5 py-1">
                              <div className="mb-0.5 text-[9px] font-medium text-muted-foreground">ETA 计算</div>
                              <div className="space-y-0.5">
                                {execution?.upcoming.map(({ step, eta }) => (
                                  <div key={step.id} className="flex items-center justify-between gap-2 text-[9px]">
                                    <span className="truncate">{stepActionLabel(step)}</span>
                                    <span className="shrink-0 text-muted-foreground">
                                      {eta?.status === "OK" ? formatETATime(eta.eta) : "无 ETA"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-[10px] text-muted-foreground">今天任务已完成</div>
                      )}
                      </>
                    )}
                  </div>
                  
                  {isExpanded && (
                    <div className="p-2 space-y-1.5 border-t bg-muted/10">
                      {/* DropIndicator 使用可见节点(订单+手动步骤)的顺序 index，保持手动步骤和订单的相对顺序 */}
                      {(() => {
                        let stepIdx = 0; // 仅统计可见节点(未完成/未删除)
                        let foundCurrentStep = false;
                        const isHovered = dropHoverDriverId === d.id;

                        const indicator = (idx: number, key: string) => (
                          <div key={key}>
                            <DropIndicator
                              driverId={d.id}
                              index={idx}
                              active={isHovered && dropPosition?.driverId === d.id && dropPosition?.index === idx}
                              onDrop={(orderId, dId, i) => stageAssignment(orderId, dId, i)}
                            />
                          </div>
                        );

                        const items: React.ReactNode[] = [];
                        if (steps.length === 0) {
                          items.push(indicator(0, "ind-top"));
                          items.push(
                            <div key="empty" className="text-xs text-muted-foreground text-center py-3">
                              暂无任务
                            </div>
                          );
                          return items;
                        }

                        // 顶部插入点 (index=0)
                        items.push(indicator(0, "ind-top"));

                        steps.forEach((step, idx) => {
                          if (step.node_type === 'order' && step.orders) {
                            const order = step.orders;
                            const tm = typeMeta(order.type);
                            const binTypeName = order.bin_type ? BIN_TYPE_NAMES[order.bin_type] || order.bin_type : '';
                            const timeLabelStr = order.time_window_custom || order.time_window || '';
                            const driverETA = displayDriverETAs[d.id];
                            const orderETA = findStepETA(driverETA, step, steps);
                            const isDraft = !!draft[order.id];
                            const isDone = step.status === 'done' || order.status === 'done';
                            const isInProgress = !isDone && (step.status === 'pending' || order.status === 'in_progress');

                            if (isDone) return; // 完成的订单不显示也不占插入位

                            const isCurrentStep = !isDone && !foundCurrentStep;
                            if (isCurrentStep) foundCurrentStep = true;

                            items.push(
                              <div
                                key={step.id}
                                data-order-id={order.id}
                                {...(isCurrentStep ? { "data-current-step": d.id } : {})}
                                draggable={!isDone}
                                onDragStart={(e) => {
                                  if (isDone) { e.preventDefault(); return; }
                                  e.dataTransfer.setData("text/plain", order.id);
                                  e.dataTransfer.effectAllowed = "move";
                                  setSidebarDragOrderId(order.id);
                                }}
                                onDragEnd={() => {
                                  setSidebarDragOrderId(null);
                                  setDropHoverDriverId(null);
                                  setDropPosition(null);
                                }}
                                className={`relative rounded-lg border-l-4 ${
                                  isDone
                                    ? "border-l-green-500 bg-green-50"
                                    : isInProgress
                                    ? "border-l-amber-500 bg-amber-50/30"
                                    : "border-l-blue-500 bg-card"
                                } shadow-md p-2.5 transition-all duration-300 hover:shadow-xl ${
                                  isDone ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                                } ${isDraft ? "ring-1 ring-amber-400" : ""} ${sidebarDragOrderId === order.id ? "opacity-40" : ""} ${highlightedOrderId === order.id ? "ring-2 ring-orange-400 shadow-orange-200 shadow-lg" : ""}`}
                              >
                                {isDone && (
                                  <div className="absolute top-1 right-1 text-[8px] text-green-700 bg-green-100 border border-green-300 rounded px-1">
                                    ✓ 完成
                                  </div>
                                )}
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-semibold leading-tight">
                                      {tm.emoji} {tm.label} {order.bin_size ? `${order.bin_size}yd` : ""} {binTypeName}
                                    </div>
                                    {driverETA && (
                                      <div className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded whitespace-nowrap font-medium border border-blue-200">
                                        {orderETA && orderETA.status === 'OK' ? formatETATime(orderETA.eta) : '无ETA'}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground leading-snug break-words" title={order.address}>
                                    {order.address}
                                  </div>
                                  <div className="text-[10px] text-primary font-medium">{timeLabelStr}</div>
                                  {isDraft && !isDone && (
                                    <div className="w-fit rounded border border-amber-300 bg-amber-100 px-1 text-[8px] text-amber-700">
                                      待同步
                                    </div>
                                  )}
                                  {order.customer_notes && (
                                    <div className="text-[9px] text-status-progress truncate">
                                      📝 {order.customer_notes}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );

                            stepIdx += 1;
                            items.push(indicator(stepIdx, `ind-${step.id}-${stepIdx}`));
                          } else {
                            const stepLabel = STEP_TYPE_LABELS[step.step_type] || step.step_type;
                            const driverETA = displayDriverETAs[d.id];
                            const stepETA = findStepETA(driverETA, step, steps);
                            const isDraftStep = step.id.startsWith('draft-step-');
                            const isMarkedForDelete = deleteStepIds.includes(step.id);
                            const isStepDone = step.status === 'done';
                            if (isMarkedForDelete || isStepDone) return;

                            const isCurrentStep = !isStepDone && !foundCurrentStep;
                            if (isCurrentStep) foundCurrentStep = true;

                            items.push(
                              <div
                                key={step.id}
                                {...(isCurrentStep ? { "data-current-step": d.id } : {})}
                                draggable={!isStepDone}
                                onDragStart={(e) => {
                                  if (isStepDone) { e.preventDefault(); return; }
                                  e.dataTransfer.setData("text/plain", `step:${step.id}`);
                                  e.dataTransfer.effectAllowed = "move";
                                  setSidebarDragOrderId(`step:${step.id}`);
                                }}
                                onDragEnd={() => {
                                  setSidebarDragOrderId(null);
                                  setDropHoverDriverId(null);
                                  setDropPosition(null);
                                }}
                                className={`relative rounded-lg border-l-4 ${
                                  isStepDone
                                    ? "border-l-green-500 bg-green-50"
                                    : "border-l-gray-400 bg-card/80"
                                } shadow-sm p-2 transition-all duration-300 hover:shadow-lg ${
                                  isStepDone ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                                } ${isDraftStep ? "ring-1 ring-amber-400" : ""} ${sidebarDragOrderId === "step:" + step.id ? "opacity-40" : ""}`}
                              >
                                {isStepDone && (
                                  <div className="absolute top-1 right-1 text-[8px] text-green-700 bg-green-100 border border-green-300 rounded px-1">
                                    ✓ 完成
                                  </div>
                                )}
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-[11px] font-semibold">{stepLabel}</div>
                                    {driverETA && (
                                      <div className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded whitespace-nowrap font-medium border border-blue-200">
                                        {stepETA && stepETA.status === 'OK' ? formatETATime(stepETA.eta) : '无ETA'}
                                      </div>
                                    )}
                                  </div>
                                  {step.location && (
                                    <div className="text-[9px] text-muted-foreground leading-snug break-words" title={step.location}>
                                      <MapPin className="h-2 w-2 inline mr-0.5" />
                                      {step.location}
                                    </div>
                                  )}
                                  {step.bin_id && (
                                    <div className="text-[9px] text-primary">桶: {step.bin_id}</div>
                                  )}
                                  {isDraftStep && !isStepDone && (
                                    <div className="w-fit rounded border border-amber-300 bg-amber-100 px-1 text-[8px] text-amber-700">
                                      待同步
                                    </div>
                                  )}
                                  {step.notes && (
                                    <div className="text-[8px] text-muted-foreground truncate">
                                      📝 {step.notes}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );

                            // 手动步骤占用一个可见节点 index
                            stepIdx += 1;
                            items.push(indicator(stepIdx, `ind-step-${step.id}-${stepIdx}-${idx}`));
                          }
                        });

                        return items;
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredDrivers.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">当前业务无活跃司机</div>
            )}
          </div>
        </Card>

        {/* 右侧地图 - 拖到地图上 = 取消分配 / 删除步骤 */}
        <div
          className="flex-1 overflow-hidden relative"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("text/plain")) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            const raw = e.dataTransfer.getData("text/plain");
            if (!raw) return;

            // 手动步骤拖到地图 → 删除
            if (raw.startsWith("step:")) {
              const stepId = raw.slice(5);
              // 如果是 draft 步骤, 直接从数组移除
              if (stepId.startsWith("draft-step-")) {
                setDraftManualSteps(prev => prev.filter(s => s.id !== stepId));
                toast.message("已移除待同步步骤");
              } else {
                // 已存在的步骤, 标记为待删除
                setDeleteStepIds(prev => prev.includes(stepId) ? prev : [...prev, stepId]);
                toast.message("已标记删除步骤 (待同步)");
              }
              return;
            }

            // 订单拖到地图 → 取消分配
            const orderId = raw;
            const serverCurrent = serverAssignments.find(a => a.order_id === orderId);
            const draftCurrent = draft[orderId];
            const currentlyAssigned = draftCurrent
              ? !!draftCurrent.driverId
              : !!serverCurrent;
            if (currentlyAssigned) {
              stageAssignment(orderId, null);
              toast.message("已标记为取消分配, 点同步保存");
            }
          }}
        >
           <DispatchMapWidget 
             drivers={filteredDrivers} 
             orders={orders} 
             assignments={assignments}
             driverETAs={displayDriverETAs}
             businessType={businessType}
             draggableOrderIds={allDayOrders.map(o => o.id)}
             unassignedOrderIds={unassignedOrders.map(o => o.id)}
             onDragHoverDriver={setDropHoverDriverId}
             onDragHoverPosition={setDropPosition}
             onAssignOrder={(orderId, driverId, index) => {
               stageAssignment(orderId, driverId, index);
             }}
             onUnassignOrder={(orderId) => {
               stageAssignment(orderId, null);
             }}
             onLocationDrop={handleLocationDrop}
             previewRoute={previewRoute}
             hoverRoute={hoverRoute}
             activeBrickFactoryIds={activeBrickFactoryIds}
             onOrderClick={setHighlightedOrderId}
             onMapDragOrder={setMapDragOrderId}
             driverDropZoneAttr={DRIVER_DROP_ZONE_ATTR}
             dropPositionAttr={DROP_POSITION_ATTR}
           />
        </div>
      </div>

      {/* 拖 3445/12441 到司机时的选择弹窗 */}
      <Dialog open={!!locationDropDialog} onOpenChange={(open) => { if (!open) setLocationDropDialog(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>
              选择步骤类型 — {locationDropDialog && MANUAL_STEP_LOCATIONS.find(l => l.id === locationDropDialog.locationId)?.shortName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">动作</Label>
              <Select value={dialogStepType} onValueChange={setDialogStepType}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="选择动作" /></SelectTrigger>
                <SelectContent>
                  {locationDropDialog?.locationId === '3445' && (
                    <SelectItem value="dump_waste">倒垃圾</SelectItem>
                  )}
                  <SelectItem value="drop_bin">放桶</SelectItem>
                  <SelectItem value="pickup_bin">取桶</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(dialogStepType === "pickup_bin" || dialogStepType === "drop_bin") && (
              <div>
                <Label className="text-xs">桶大小</Label>
                <Select value={dialogBinSize} onValueChange={setDialogBinSize}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="选择桶大小" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="14">14 yd</SelectItem>
                    <SelectItem value="20">20 yd</SelectItem>
                    <SelectItem value="30">30 yd</SelectItem>
                    <SelectItem value="40">40 yd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocationDropDialog(null)}>取消</Button>
            <Button onClick={confirmLocationDrop}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ DropIndicator: 拖拽时显示的"插入位置"指示条 ============
function buildDriverETAFromMatrix(input: {
  driverId: string;
  driverName: string;
  vehicleId: string;
  samsaraVehicleId: string;
  currentLocation: { lat: number; lng: number };
  currentAddress: string;
  steps: Array<{ id: string; stepId: string; orderId: string | null; address: string }>;
  entries: RouteMatrixEntry[];
  nowMs?: number;
}): DriverETA {
  let cumulativeSeconds = 0;
  let totalDistance = 0;
  const now = input.nowMs ?? Date.now();

  const orders: ETAResult[] = input.steps.map((step, index) => {
    const fromAddress = index === 0 ? input.currentAddress : input.steps[index - 1].address;
    const leg = findMatrixLeg(input.entries, fromAddress, step.address);
    const driveSeconds = Math.round((leg?.duration || 0) * 1.2);
    const distance = leg?.distance || 0;
    cumulativeSeconds += driveSeconds;
    totalDistance += distance;
    const eta = new Date(now + cumulativeSeconds * 1000).toISOString();
    cumulativeSeconds += STOP_DURATION_SECONDS;

    return {
      orderId: step.id,
      stepId: step.stepId,
      orderAddress: step.address,
      distance,
      duration: driveSeconds,
      fromStepId: index === 0 ? null : input.steps[index - 1].id,
      source: leg?.source || "fallback",
      eta,
      status: leg ? "OK" : "ERROR",
    };
  });

  return {
    driverId: input.driverId,
    driverName: input.driverName,
    vehicleId: input.vehicleId,
    samsaraVehicleId: input.samsaraVehicleId,
    currentLocation: input.currentLocation,
    orders,
    totalDistance,
    totalDuration: orders.reduce((sum, order) => sum + order.duration, 0),
    lastUpdated: new Date().toISOString(),
  };
}

async function saveDriverETASnapshot(input: {
  driverId: string;
  scheduledDate: string;
  eta: DriverETA;
  steps: JobStep[];
}) {
  const stepByEtaId = new Map(input.steps.map((step) => [stepEtaId(step), step]));
  const rows = input.eta.orders
    .map((result) => {
      const step = result.stepId
        ? input.steps.find((item) => item.id === result.stepId)
        : stepByEtaId.get(result.orderId);
      if (!step) return null;
      const range = result.status === "OK" ? formatEtaRange(result.eta, step) : null;
      const etaDate = new Date(result.eta);
      const etaMin = range ? new Date(etaDate.getTime() - 5 * 60_000).toISOString() : null;
      const etaMax = range
        ? new Date(etaDate.getTime() + etaBufferMinutes(step) * 60_000).toISOString()
        : null;

      return {
        step_id: step.id,
        order_id: step.node_type === "order" ? step.order_id : null,
        driver_id: input.driverId,
        scheduled_date: input.scheduledDate,
        step_number: step.step_number,
        eta_at: result.eta,
        eta_min_at: etaMin,
        eta_max_at: etaMax,
        duration_seconds: Math.round(result.duration || 0),
        distance_meters: Math.round(result.distance || 0),
        source: result.source || "matrix",
        status: result.status,
        computed_at: input.eta.lastUpdated,
        payload: {
          orderId: result.orderId,
          orderAddress: result.orderAddress,
          fromStepId: result.fromStepId ?? null,
          rangeLabel: range?.label ?? null,
          risk: range?.risk ?? false,
        },
      };
    })
    .filter(Boolean);

  if (!rows.length) return;
  const { error } = await (supabase.from as any)("driver_eta_snapshots").upsert(rows, {
    onConflict: "step_id",
  });
  if (error) throw error;
}

function findStepETA(driverETA: DriverETA | undefined, step: JobStep, steps?: JobStep[], nowMs = Date.now()) {
  if (!driverETA) return null;
  const targetId = stepEtaId(step);
  const planned = driverETA.orders.find((eta) => eta.orderId === targetId) ?? null;
  if (!planned || !steps) return planned;

  const sorted = steps.slice().sort((a, b) => a.step_number - b.step_number);
  const targetIndex = sorted.findIndex((item) => stepEtaId(item) === targetId);
  if (targetIndex < 0) return planned;

  // 用最近一个已完成步骤的完成时间作为锚点，重算后续 ETA（不随当前时间漂移）
  for (let i = targetIndex - 1; i >= 0; i--) {
    const completedAt = sorted[i].completed_at;
    if (!completedAt || sorted[i].status !== "done") continue;

    let rollingTime = new Date(completedAt).getTime();
    for (let j = i + 1; j <= targetIndex; j++) {
      if (j > i + 1) rollingTime += serviceSecondsForStep(sorted[j - 1]) * 1000;
      const leg = driverETA.orders.find((eta) => eta.orderId === stepEtaId(sorted[j]));
      rollingTime += (leg?.duration || 0) * 1000;
    }

    return {
      ...planned,
      eta: new Date(rollingTime).toISOString(),
      source: "rolling" as const,
    };
  }

  // 没有已完成的步骤作为锚点时，直接返回原始 planned ETA，不从当前时间重算
  return planned;
}

function findMatrixLeg(entries: RouteMatrixEntry[], from: string, to: string) {
  return entries.find((entry) => sameRouteAddress(entry.from, from) && sameRouteAddress(entry.to, to));
}

function sameRouteAddress(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function stepEtaId(step: JobStep) {
  return step.node_type === "order" && step.order_id ? step.order_id : step.id;
}

function serviceSecondsForStep(step: JobStep) {
  const pallets = Number(step.orders?.pallet_count || 0);
  if (pallets > 0) return (10 + pallets * 2) * 60;
  return STOP_DURATION_SECONDS;
}

function normalizeEtaAddress(address: string) {
  const trimmed = address.trim();
  if (/\b(on|ontario|canada)\b/i.test(trimmed) || trimmed.includes(",")) return trimmed;
  return `${trimmed}, ON, Canada`;
}

function stepActionLabel(step: JobStep) {
  if (step.node_type === "step") {
    return STEP_TYPE_LABELS[step.step_type] || step.step_type;
  }

  const order = step.orders;
  if (!order) return STEP_TYPE_LABELS[step.step_type] || step.step_type;
  const meta = typeMeta(order.type);
  const size = order.bin_size ? `${order.bin_size}yd` : "";
  const binType = order.bin_type ? BIN_TYPE_NAMES[order.bin_type] || order.bin_type : "";
  return `${meta.label}${size ? ` ${size}` : ""}${binType ? ` ${binType}` : ""}`;
}

function stepLocationLabel(step: JobStep) {
  if (step.node_type === "order" && step.orders?.address) return step.orders.address;
  return step.location || "未设置地点";
}

function formatEtaRange(etaIso: string, step: JobStep) {
  const eta = new Date(etaIso);
  const early = new Date(eta.getTime() - 5 * 60_000);
  const late = new Date(eta.getTime() + etaBufferMinutes(step) * 60_000);
  const due = stepDueTime(step, eta);
  return {
    label: `${formatShortTime(early)}-${formatShortTime(late)}`,
    risk: due ? eta.getTime() > due.getTime() : false,
  };
}

function etaBufferMinutes(step: JobStep) {
  const raw = `${step.orders?.time_window || ""} ${step.orders?.time_window_custom || ""} ${step.orders?.customer_notes || ""}`.toLowerCase();
  if (raw.includes("must")) return 5;
  if (raw.includes("asap") || raw.includes("before")) return 10;
  return 15;
}

function stepDueTime(step: JobStep, reference: Date) {
  const raw = `${step.orders?.time_window_custom || ""} ${step.orders?.time_window || ""}`.toLowerCase();
  if (!raw.trim()) return null;

  let hour: number | null = null;
  const range = raw.match(/(\d{1,2})(?::\d{2})?\s*(am|pm)?\s*[-~]\s*(\d{1,2})(?::\d{2})?\s*(am|pm)?/);
  if (range) {
    hour = Number(range[3]);
    const suffix = range[4] || range[2] || "";
    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
  } else if (raw.includes("noon") || raw.includes("before 12")) {
    hour = 12;
  } else if (raw.includes("am")) {
    hour = 12;
  }

  if (hour == null) return null;
  const due = new Date(reference);
  due.setHours(hour, 0, 0, 0);
  return due;
}

function formatShortTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function DropIndicator({
  driverId, index, active, onDrop,
}: {
  driverId: string;
  index: number;
  active: boolean;
  onDrop?: (orderId: string, driverId: string, index: number) => void;
}) {
  const [isOver, setIsOver] = useState(false);
  return (
    <div
      {...{ [DROP_POSITION_ATTR]: `${driverId}:${index}` }}
      onDragOver={(e) => {
        // 允许 drop (必须 preventDefault)
        if (e.dataTransfer.types.includes("text/plain")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!isOver) setIsOver(true);
        }
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation(); // 防止冒泡到父级 driver card 的 onDrop
        setIsOver(false);
        const raw = e.dataTransfer.getData("text/plain");
        if (raw && onDrop) onDrop(raw, driverId, index);
      }}
      className={`rounded-full transition-all my-0.5 ${
        active || isOver ? "bg-primary h-2 shadow-md shadow-primary/50" : "bg-transparent h-1.5"
      }`}
    />
  );
}
