import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayISO, typeMeta } from "@/lib/business";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, ChevronDown, ChevronRight, MapPin, Clock, Loader2, Save, RotateCcw } from "lucide-react";
import { DispatchMapWidget } from "@/components/DispatchMapWidget";
import { calculateDriverETAWithSamsara, formatETATime, type DriverETA } from "@/lib/eta-calculator";
import { fetchSamsaraVehicles } from "@/lib/samsara-api";
import { getFullAddress, MANUAL_STEP_LOCATIONS } from "@/lib/manual-step-locations";
import { toast } from "sonner";
import { BusinessTypeSelector } from "@/components/BusinessTypeSelector";
import { useBusinessType } from "@/lib/business-type-storage";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// 司机卡片放置区域的 data-* 标识, DispatchMapWidget 会根据它判断拖拽释放位置
export const DRIVER_DROP_ZONE_ATTR = "data-fleet-driver-drop";
// 司机任务列表里的插入位置指示条 data-* 标识
export const DROP_POSITION_ATTR = "data-fleet-drop-position";

type Driver = { id: string; name: string };

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

type Order = { 
  id: string; 
  order_number: string; 
  address: string; 
  type: string; 
  status: string; 
  customer_notes?: string;
  bin_size?: string;
  bin_type?: string;
  time_window?: string;
  time_window_custom?: string;
};

type Assignment = {
  id: string;
  driver_id: string;
  order_id: string;
  sequence: number;
  orders: Order;
};

type JobStep = {
  id: string;
  driver_id: string;
  scheduled_date: string;
  step_number: number;
  order_id: string | null;
  assignment_id: string | null;
  node_type: 'order' | 'step';
  location: string | null;
  step_type: string;
  bin_id: string | null;
  notes: string | null;
  status: string;
  orders?: Order | null;
};

export function FleetMapPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());
  const [calculatingDriverId, setCalculatingDriverId] = useState<string | null>(null);
  const [driverETAs, setDriverETAs] = useState<Record<string, DriverETA>>({});
  const [showingETADrivers, setShowingETADrivers] = useState<Set<string>>(new Set());
  const [businessType, setBusinessType] = useBusinessType();
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
  // key = order.id
  //   driverId = null  → 未分配 (若原本有分配，同步时需要删 dispatch_assignments)
  //   driverId = 'xxx' → 分配给这位司机
  //   index            → 在该司机订单任务列表中的顺序 (0 开头)
  type DraftEntry = { orderId: string; driverId: string | null; index: number };
  const [draft, setDraft] = useState<Record<string, DraftEntry>>({});

  // 手动步骤草稿: 从地图固定地点拖到司机产生的待同步步骤
  type DraftManualStep = {
    id: string; // 临时 id
    driverId: string;
    location: string; // shortName
    stepType: string; // dump_waste / pickup_bin / drop_bin
    notes: string; // 桶大小等
    index: number; // 在该司机列表中的位置
  };
  const [draftManualSteps, setDraftManualSteps] = useState<DraftManualStep[]>([]);
  // 已存在的手动步骤要删除的 id (拖到地图上 = 删除)
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

  // 地图点击订单时, 自动展开对应司机并滚动到该订单卡片
  useEffect(() => {
    if (!highlightedOrderId) return;
    // 找到该订单属于哪个司机
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
    // 延迟滚动到高亮的卡片
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-order-id="${highlightedOrderId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    // 3秒后自动取消高亮
    const clearTimer = setTimeout(() => setHighlightedOrderId(null), 3000);
    return () => { clearTimeout(timer); clearTimeout(clearTimer); };
  }, [highlightedOrderId, driverJobSteps]);

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers-assigned"],
    queryFn: async () => {
      // 获取已分配车辆的司机 ID
      const { data: assignments } = await supabase
        .from("driver_vehicle_assignments")
        .select("driver_id");
      const assignedIds = (assignments || []).map(a => a.driver_id);

      const { data, error } = await supabase
        .from("profiles")
        .select("id,name")
        .eq("role", "driver")
        .eq("is_active", true)
        .in("id", assignedIds.length > 0 ? assignedIds : ["none"])
        .order("name");
      if (error) throw error;
      return data as Driver[];
    },
  });

  // 获取所有任务步骤（包含订单节点和手动步骤节点）
  const { data: jobSteps = [] } = useQuery({
    queryKey: ["map-job-steps", date, businessType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_steps")
        .select("*, orders(*)")
        .eq("scheduled_date", date)
        .order("step_number");
      if (error) throw error;
      
      // 过滤订单节点，只保留匹配业务类型的
      const filtered = (data ?? []).filter(step => {
        if (step.node_type === 'order' && step.orders) {
          return (step.orders as any).business_type === businessType;
        }
        // 手动步骤节点保留（它们不属于特定业务类型）
        return true;
      });
      
      return filtered as unknown as JobStep[];
    },
    refetchInterval: 15000, // 每15秒自动刷新, 及时反映司机完成状态
  });
  
  // 获取当日所有订单（包括未分配的），用于在地图上显示未排班订单
  const { data: allDayOrders = [] } = useQuery({
    queryKey: ["map-all-orders", date, businessType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("service_date", date)
        .eq("business_type", businessType)
        .neq("status", "cancelled")
        .order("created_at");
      if (error) throw error;
      // 地图侧隐藏换桶自动生成的 pickup 子单:
      // 有 linked_order_id 的 pickup 属于某条 swap 订单,不单独出现
      const mainSwapIds = new Set(
        (data ?? []).filter((o: any) => o.type === "swap").map((o: any) => o.id)
      );
      return (data ?? []).filter((o: any) => {
        if (o.type === "pickup" && o.linked_order_id && mainSwapIds.has(o.linked_order_id)) return false;
        return true;
      }) as Order[];
    },
    refetchInterval: 15000, // 与 jobSteps 同步刷新
  });
  const orders = useMemo(() => {
    // 合并已分配订单和全部当日订单 - 这样地图上能看到即使没有分配的订单
    const uniqueOrders = new Map<string, Order>();
    // 先加入 jobSteps 里已分配的订单（带司机/状态信息）
    jobSteps.forEach(step => {
      if (step.node_type === 'order' && step.orders) {
        uniqueOrders.set(step.orders.id, step.orders);
      }
    });
    // 再补齐未分配的订单
    allDayOrders.forEach(o => {
      if (!uniqueOrders.has(o.id)) {
        uniqueOrders.set(o.id, o);
      }
    });
    return Array.from(uniqueOrders.values());
  }, [jobSteps, allDayOrders]);

  const { data: vehicleAssignments = [] } = useQuery({
    queryKey: ["driver-vehicle-assignments-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_vehicle_assignments")
        .select("*, vehicles(*)");
      if (error) throw error;
      return data || [];
    },
  });

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
  
  // 服务器持久化数据: assignments 基于 jobSteps (order 节点) 生成
  const serverAssignments = useMemo(() => {
    return jobSteps
      .filter(step => step.node_type === 'order' && step.assignment_id)
      .map(step => ({
        id: step.assignment_id!,
        driver_id: step.driver_id,
        order_id: step.order_id!,
        sequence: step.step_number,
        orders: step.orders!
      }));
  }, [jobSteps]);

  // 订单 id → 订单完整对象 (给地图和任务列表共用的快速查找)
  const orderById = useMemo(() => {
    const m = new Map<string, Order>();
    allDayOrders.forEach(o => m.set(o.id, o));
    serverAssignments.forEach(a => { if (a.orders) m.set(a.order_id, a.orders as Order); });
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
      .sort((a, b) => a.sequence - b.sequence)
      .forEach(a => {
        const arr = perDriver.get(a.driver_id) ?? [];
        arr.push({ orderId: a.order_id, seq: a.sequence });
        perDriver.set(a.driver_id, arr);
        assignedSet.add(a.order_id);
      });

    // 然后逐条应用 draft 覆盖
    Object.values(draft).forEach(d => {
      // 先把它从所有司机列表里抠出去
      perDriver.forEach((arr, dId) => {
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
      .filter(o => !assignedSet.has(o.id) && o.status !== "done")
      .map(o => o.id);

    return { assigned, unassigned };
  }, [serverAssignments, allDayOrders, draft]);

  // 给地图用的 assignments 数组 (按合并后的顺序生成 sequence)
  const assignments = useMemo(() => {
    const result: any[] = [];
    Object.entries(merged.assigned).forEach(([driverId, orderIds]) => {
      orderIds.forEach((orderId, idx) => {
        const order = orderById.get(orderId);
        if (!order) return;
        // 找服务器原始 assignment (如果有)
        const existing = serverAssignments.find(
          a => a.driver_id === driverId && a.order_id === orderId
        );
        result.push({
          id: existing?.id ?? `local-${orderId}`,
          driver_id: driverId,
          order_id: orderId,
          sequence: idx + 1,
          orders: order,
        });
      });
    });
    return result;
  }, [merged.assigned, serverAssignments, orderById]);

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
    jobSteps.forEach(step => {
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
          s => s.node_type === 'order' && s.order_id === orderId && s.driver_id === driverId
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
          orders: order,
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
    filteredDrivers.forEach(d => { map[d.id] ??= []; });

    return map;
  }, [jobSteps, merged.assigned, orderById, date, draftManualSteps, deleteStepIds, filteredDrivers]);

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
  const hoverRoute = useMemo(() => {
    if (!hoveredDriverId) return null;

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

    const driverSteps = driverJobSteps[hoveredDriverId] ?? [];
    const routePoints: { lat: number; lng: number }[] = [];
    driverSteps.forEach(step => {
      const addr = step.node_type === 'order' && step.orders
        ? step.orders.address
        : step.location;
      const coords = getCoords(addr);
      if (coords) routePoints.push(coords);
    });

    if (routePoints.length < 2) return null;
    return routePoints;
  }, [hoveredDriverId, driverJobSteps]);

  // 当天砖业务订单涉及的砖厂 shortName 集合 (用于地图只显示相关砖厂)
  const activeBrickFactoryIds = useMemo(() => {
    if (businessType !== 'brick') return new Set<string>();
    const ids = new Set<string>();
    const brickFactories = MANUAL_STEP_LOCATIONS.filter(l => l.type === 'brick_factory');
    // 从当天所有订单的地址中匹配砖厂
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
    // 也从 jobSteps 的 location 字段匹配
    jobSteps.forEach(step => {
      const loc = (step.location || '').toUpperCase();
      brickFactories.forEach(factory => {
        if (loc.includes(factory.shortName.toUpperCase()) ||
            factory.shortName.toUpperCase().includes(loc)) {
          ids.add(factory.id);
        }
      });
    });
    return ids;
  }, [businessType, allDayOrders, jobSteps]);

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
        const existingStep = jobSteps.find(s => s.id === stepId);
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

      // 需要把统一 index 转换为订单序列中的 index
      // 因为 merged.assigned 只跟踪订单, 不包含手动步骤
      let orderIndex = index;
      if (driverId && index !== undefined) {
        // 统一列表中 index 位置之前有多少个订单节点 = 订单序列中的 index
        const steps = driverJobSteps[driverId] ?? [];
        let orderCount = 0;
        for (let i = 0; i < Math.min(index, steps.length); i++) {
          if (steps[i].node_type === 'order' && steps[i].order_id !== orderId) {
            orderCount++;
          }
        }
        orderIndex = orderCount;
      }

      // 计算目标位置: 如果没指定 index 就放末尾
      let targetIndex = orderIndex ?? 0;
      if (driverId && index === undefined) {
        targetIndex = (merged.assigned[driverId] ?? []).length;
        if ((merged.assigned[driverId] ?? []).includes(orderId)) {
          targetIndex = Math.max(0, targetIndex - 1);
        }
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
        material: "customer_delivery",
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
          step_type: stepTypeMap[order.type] || "customer_delivery",
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
          step_type: ms.stepType,
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
    // 如果已经显示ETA，则隐藏
    if (showingETADrivers.has(driverId)) {
      setShowingETADrivers(prev => {
        const next = new Set(prev);
        next.delete(driverId);
        return next;
      });
      // 从driverETAs中移除
      setDriverETAs(prev => {
        const next = { ...prev };
        delete next[driverId];
        return next;
      });
      toast.success(`已隐藏 ${driverName} 的路线`);
      return;
    }
    
    setCalculatingDriverId(driverId);
    try {
      // 获取 Samsara 车辆位置
      const samsaraResult = await fetchSamsaraVehicles();
      if (!samsaraResult.success) {
        toast.error('无法获取车辆位置');
        return;
      }

      // 获取车辆分配信息
      const { data: vehicleAssignments } = await supabase
        .from("driver_vehicle_assignments")
        .select(`
          driver_id,
          vehicle_id,
          profiles!driver_vehicle_assignments_driver_id_fkey(name),
          vehicles!driver_vehicle_assignments_vehicle_id_fkey(name, samsara_id)
        `);

      const driverSteps = driverJobSteps[driverId] ?? [];
      
      // 包含所有步骤（订单节点 + 手动步骤节点）
      const allSteps = driverSteps.map(s => {
        if (s.node_type === 'order' && s.orders) {
          return {
            id: s.orders.id,
            address: s.orders.address,
            type: 'order' as const,
            stepNumber: s.step_number
          };
        } else if (s.node_type === 'step' && s.location) {
          // 对于手动步骤，使用完整地址
          return {
            id: s.id,
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
      const assignment = vehicleAssignments?.find((a: any) => a.driver_id === driverId);
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
      const vehicle = samsaraResult.data.find(v => v.id === samsaraVehicleId);
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
        address: s!.address,
      }));

      const eta = await calculateDriverETAWithSamsara(
        driverId,
        driverName,
        assignment.vehicle_id,
        samsaraVehicleId,
        currentLocation,
        stepsForETA
      );

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
        <Card className="w-64 flex flex-col overflow-hidden shrink-0 shadow-sm rounded-none border-r border-t-0 border-l-0 border-b-0">
          <div className="p-3 border-b bg-muted/20 font-semibold text-sm flex items-center gap-2 shrink-0">
            <Truck className="h-4 w-4" />
            司机任务 ({filteredDrivers.length})
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
            {filteredDrivers.map(d => {
              const steps = driverJobSteps[d.id] ?? [];
              const isExpanded = expandedDrivers.has(d.id);
              
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
                  }`}
                >
                  <div 
                    className="flex items-center justify-between p-2 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => toggleDriver(d.id)}
                    onMouseEnter={() => setHoveredDriverId(d.id)}
                    onMouseLeave={() => setHoveredDriverId(null)}
                  >
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground"/> : <ChevronRight className="h-4 w-4 text-muted-foreground"/>}
                      {d.name}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-xs">{steps.length}</Badge>
                      <Button
                        size="sm"
                        variant={showingETADrivers.has(d.id) ? "default" : "ghost"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCalculateDriverETA(d.id, d.name);
                        }}
                        disabled={calculatingDriverId === d.id}
                        className="h-6 w-6 p-0"
                        title={showingETADrivers.has(d.id) ? "隐藏路线" : "计算 ETA"}
                      >
                        {calculatingDriverId === d.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="p-2 space-y-1.5 border-t bg-muted/10">
                      {/* 统一索引: 每个节点 (订单/手动步骤) 之间都有 DropIndicator */}
                      {(() => {
                        let stepIdx = 0; // 统一列表中的位置
                        let foundCurrentStep = false; // 是否已找到第一个未完成的步骤
                        const isHovered = dropHoverDriverId === d.id;

                        // 顶部插入点
                        const topIndicator = (
                          <DropIndicator
                            driverId={d.id}
                            index={0}
                            active={isHovered && dropPosition?.driverId === d.id && dropPosition?.index === 0}
                            onDrop={(orderId, dId, idx) => stageAssignment(orderId, dId, idx)}
                          />
                        );

                        const items: React.ReactNode[] = [];
                        if (steps.length === 0) {
                          items.push(topIndicator);
                          items.push(
                            <div key="empty" className="text-xs text-muted-foreground text-center py-3">
                              暂无任务
                            </div>
                          );
                        } else {
                          // 顶部
                          items.push(<div key="top-ind">{topIndicator}</div>);
                          steps.forEach((step, i) => {
                            if (step.node_type === 'order' && step.orders) {
                              const order = step.orders;
                              const tm = typeMeta(order.type);
                              const binTypeName = order.bin_type ? BIN_TYPE_NAMES[order.bin_type] || order.bin_type : '';
                              const timeLabel = order.time_window_custom || order.time_window || '';
                              const driverETA = driverETAs[d.id];
                              const orderETA = driverETA?.orders.find(o => o.orderId === order.id);
                              // 这个卡片是否为本地 draft 新增 / 变动
                              const isDraft = !!draft[order.id];
                              // 订单/步骤完成状态
                              const isDone = step.status === 'done' || order.status === 'done';
                              const isInProgress = !isDone && (step.status === 'pending' || order.status === 'in_progress');

                              // 标记第一个未完成的步骤 (用于展开时自动滚动)
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
                                  {isDraft && !isDone && (
                                    <div className="absolute top-1 right-1 text-[8px] text-amber-700 bg-amber-100 border border-amber-300 rounded px-1">
                                      待同步
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
                                    <div className="text-[10px] text-primary font-medium">{timeLabel}</div>
                                    {order.customer_notes && (
                                      <div className="text-[9px] text-status-progress truncate">
                                        📝 {order.customer_notes}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                              // 每张卡片后面插入一个 drop point (统一 index)
                              stepIdx += 1;
                              items.push(
                                <div key={`ind-${step.id}`}>
                                  <DropIndicator
                                    driverId={d.id}
                                    index={stepIdx}
                                    active={isHovered && dropPosition?.driverId === d.id && dropPosition?.index === stepIdx}
                                    onDrop={(orderId, dId, idx) => stageAssignment(orderId, dId, idx)}
                                  />
                                </div>
                              );
                            } else {
                              // 手动步骤节点卡片
                              const stepLabel = STEP_TYPE_LABELS[step.step_type] || step.step_type;
                              const isDraftStep = step.id.startsWith('draft-step-');
                              const isMarkedForDelete = deleteStepIds.includes(step.id);
                              const isStepDone = step.status === 'done';
                              // 已标记删除的不显示
                              if (isMarkedForDelete) {
                                return;
                              }
                              // 标记第一个未完成的步骤
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
                                  {isDraftStep && !isStepDone && (
                                    <div className="absolute top-1 right-1 text-[8px] text-amber-700 bg-amber-100 border border-amber-300 rounded px-1">
                                      待同步
                                    </div>
                                  )}
                                  <div className="flex flex-col gap-1">
                                    <div className="text-[11px] font-semibold">{stepLabel}</div>
                                    {step.location && (
                                      <div className="text-[9px] text-muted-foreground leading-snug break-words" title={step.location}>
                                        <MapPin className="h-2 w-2 inline mr-0.5" />
                                        {step.location}
                                      </div>
                                    )}
                                    {step.bin_id && (
                                      <div className="text-[9px] text-primary">桶: {step.bin_id}</div>
                                    )}
                                    {step.notes && (
                                      <div className="text-[8px] text-muted-foreground truncate">
                                        📝 {step.notes}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                              // 手动步骤后面也插入 drop point
                              stepIdx += 1;
                              items.push(
                                <div key={`ind-step-${step.id}`}>
                                  <DropIndicator
                                    driverId={d.id}
                                    index={stepIdx}
                                    active={isHovered && dropPosition?.driverId === d.id && dropPosition?.index === stepIdx}
                                    onDrop={(orderId, dId, idx) => stageAssignment(orderId, dId, idx)}
                                  />
                                </div>
                              );
                            }
                          });
                        }
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
             driverETAs={driverETAs}
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
