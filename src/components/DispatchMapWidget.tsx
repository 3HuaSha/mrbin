import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSamsaraVehicles } from "@/lib/samsara-api";
import { supabase } from "@/integrations/supabase/client";
import { MANUAL_STEP_LOCATIONS, LOCATION_TYPE_NAMES } from "@/lib/manual-step-locations";

const KENNEDY_DEPOT = { lat: 43.821044, lng: -79.304742, label: "Kennedy Depot" };

export function DispatchMapWidget({
  drivers, orders = [], assignments = [], driverETAs = {}, businessType = 'garbage',
  unassignedOrderIds = [],
  draggableOrderIds,
  onDragHoverDriver,
  onDragHoverPosition,
  onAssignOrder,
  onUnassignOrder,
  onLocationDrop,
  previewRoute,
  hoverRoute,
  activeBrickFactoryIds,
  onOrderClick,
  onMapDragOrder,
  driverDropZoneAttr = "data-fleet-driver-drop",
  dropPositionAttr = "data-fleet-drop-position",
}: { 
  drivers: any[], 
  orders?: any[], 
  assignments?: any[],
  driverETAs?: Record<string, any>,
  businessType?: 'garbage' | 'brick',
  /** 未分配订单 id 列表, 地图上会用不同样式标识 */
  unassignedOrderIds?: string[],
  /** 允许拖拽的订单 id 列表 (默认等于 unassignedOrderIds) */
  draggableOrderIds?: string[],
  /** 拖拽时悬停在哪个司机上的回调 */
  onDragHoverDriver?: (driverId: string | null) => void,
  /** 拖拽时命中的司机+插入位置 (从 [data-fleet-drop-position] 解析), 空位置表示放末尾 */
  onDragHoverPosition?: (pos: { driverId: string; index: number } | null) => void,
  /** 释放到司机上时的回调: (orderId, driverId, insertionIndex?) */
  onAssignOrder?: (orderId: string, driverId: string, index?: number) => void,
  /** 释放到地图空白 (非司机、非位置指示) 时的回调: 取消分配 */
  onUnassignOrder?: (orderId: string) => void,
  /** 固定地点 marker 拖到司机时的回调: (locationId, driverId, index?) */
  onLocationDrop?: (locationId: string, driverId: string, index?: number) => void,
  /** 拖拽预览路线: 当拖拽订单悬停在司机上时, 显示该司机加上新订单后的路线预览 */
  previewRoute?: { lat: number; lng: number }[] | null,
  /** 悬停司机时的路线高亮: 该司机所有任务点连线 */
  hoverRoute?: { lat: number; lng: number }[] | null,
  /** 当天有取货单的砖厂 id 集合 (砖业务时只显示这些砖厂标记) */
  activeBrickFactoryIds?: Set<string>,
  /** 地图上点击订单标记时的回调 */
  onOrderClick?: (orderId: string) => void,
  /** 地图上开始/结束拖拽订单时的回调, 用于通知父组件当前正在拖拽哪个订单 */
  onMapDragOrder?: (orderId: string | null) => void,
  /** 司机行的 data-* 属性名 */
  driverDropZoneAttr?: string,
  /** 位置指示的 data-* 属性名, 值格式: `${driverId}:${index}` */
  dropPositionAttr?: string,
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const infoWindowRef = useRef<any>(null);
  const routeLinesRef = useRef<any[]>([]); // 存储路线折线
  const previewLineRef = useRef<any>(null); // 拖拽预览路线折线
  const hoverLineRef = useRef<any>(null); // 悬停司机路线折线

  // 拖拽未分配订单到司机卡片的辅助 ref
  // - lastMouseRef: 全局鼠标位置, 用 document mousemove 捕获 (Google Maps 的 dragend 不给 DOM 事件)
  // - hoverDriverRef: 当前悬停在哪个司机 drop zone 上
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null);
  const hoverDriverRef = useRef<string | null>(null);
  const currentDraggingOrderRef = useRef<string | null>(null);
  // Ref for onLocationDrop so the map-init effect (runs once) can access latest callback
  const onLocationDropRef = useRef(onLocationDrop);
  onLocationDropRef.current = onLocationDrop;

  // Geocode 缓存: 地址 → { lat, lng }, 避免重复调用 Geocoding API
  // 使用 localStorage 持久化, 当天内切换页面/刷新都不会重新调用
  const geocodeCacheRef = useRef<Record<string, { lat: number; lng: number }>>((() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const raw = localStorage.getItem('geocode-cache');
      if (raw) {
        const parsed = JSON.parse(raw);
        // 只用当天的缓存, 过期的清掉
        if (parsed._date === today) {
          const { _date, ...rest } = parsed;
          return rest;
        }
      }
    } catch {}
    return {};
  })());

  // 写入 localStorage 的辅助函数
  const saveGeocodeCache = (cache: Record<string, { lat: number; lng: number }>) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem('geocode-cache', JSON.stringify({ _date: today, ...cache }));
    } catch {}
  };
  
  const [mapLoaded, setMapLoaded] = useState(false);

  // Samsara 车辆位置: 用 React Query 托管, 有缓存, 自动 refetch, 页面切回立刻有数据
  const { data: samsaraLocs = [] } = useQuery<any[]>({
    queryKey: ["samsara-vehicles"],
    queryFn: async () => {
      const result = await fetchSamsaraVehicles();
      if (!result.success) {
        // 抛错让 React Query 自动重试, 同时 placeholderData 保留上次成功数据
        throw new Error(result.error || 'Samsara 获取失败');
      }
      return result.data || [];
    },
    // 首次拉取后 30s 重新获取一次, 保持和原实现一致
    refetchInterval: 30000,
    // 切换页面 / focus 时不强制重取 (避免闪烁), 用缓存数据
    refetchOnWindowFocus: false,
    // 每次组件挂载(含 SPA 路由切换)都立即重新获取, 避免导航过来时缓存为空
    refetchOnMount: 'always',
    // 失败时自动重试 3 次, 间隔递增
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    // 缓存 10s 内认为新鲜, 避免不必要的重复请求
    staleTime: 10000,
    // 重新获取期间保留上次成功的数据, 避免闪烁
    placeholderData: (prev: any) => prev,
  });

  // 未分配订单 id 集合 (稳定引用, 便于在 effect 内判断)
  const unassignedOrderSet = useMemo(
    () => new Set(unassignedOrderIds),
    [unassignedOrderIds]
  );
  // 可拖拽订单 id 集合 (默认等于未分配 + 已分配, 即 draggableOrderIds 全部)
  const draggableOrderSet = useMemo(
    () => new Set(draggableOrderIds ?? unassignedOrderIds),
    [draggableOrderIds, unassignedOrderIds]
  );

  // 全局 mousemove 捕获: Google Maps 的 marker drag 不暴露 DOM 事件
  // 我们需要知道释放时鼠标在屏幕上哪里, 才能用 elementFromPoint 判断落在哪个司机卡片上
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("dragover", (e: any) => {
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // 查找鼠标下方的命中项: 返回 { driverId, index? }
  //   - 优先命中 [data-fleet-drop-position] → 可以精确指定插入索引
  //   - 否则命中 [data-fleet-driver-drop]   → 表示"放末尾"
  //   - 都没命中 → null
  const findDropTargetAtCursor = (): { driverId: string; index?: number } | null => {
    const mouse = lastMouseRef.current;
    if (!mouse) return null;
    const el = document.elementFromPoint(mouse.x, mouse.y);
    if (!el) return null;

    // 先查精确插入位置
    const posEl = (el as HTMLElement).closest(`[${dropPositionAttr}]`);
    if (posEl) {
      const raw = posEl.getAttribute(dropPositionAttr) || "";
      const [driverId, idxStr] = raw.split(":");
      if (driverId) {
        return { driverId, index: Number(idxStr) || 0 };
      }
    }
    // 退化到司机卡片命中
    const zone = (el as HTMLElement).closest(`[${driverDropZoneAttr}]`);
    if (!zone) return null;
    const driverId = zone.getAttribute(driverDropZoneAttr);
    if (!driverId) return null;
    return { driverId };
  };
  
  // 获取车辆分配信息（包含车辆的 type 字段）
  const { data: vehicleAssignments = [] } = useQuery({
    queryKey: ["driver-vehicle-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_vehicle_assignments")
        .select(`
          driver_id,
          vehicle_id,
          profiles!driver_vehicle_assignments_driver_id_fkey(name),
          vehicles!driver_vehicle_assignments_vehicle_id_fkey(name, samsara_id, type)
        `);
      if (error) {
        console.error("❌ 获取车辆分配失败:", error);
        throw error;
      }
      return data || [];
    },
    // SPA 路由切换回来时保证有最新数据
    refetchOnMount: 'always',
    staleTime: 30000,
  });
  
  // 调试：打印车辆分配数据（仅在开发环境）
  useEffect(() => {
    if (vehicleAssignments.length > 0 && import.meta.env.DEV) {
      console.log("车辆分配数据:", vehicleAssignments.length, "条");
    }
  }, [vehicleAssignments]);
  
  // 提取车辆类型
  const extractVehicleType = (name: string): string => {
    if (!name) return "OTHER";
    const upperName = name.toUpperCase();
    
    if (upperName.startsWith("BIN")) return "BIN";
    if (upperName.startsWith("FLAT")) return "FLAT";
    if (upperName.startsWith("DUMP")) return "DUMP";
    if (upperName.startsWith("HINO")) return "HINO";
    if (upperName.startsWith("MACK")) return "MACK";
    if (upperName.startsWith("PROALL")) return "PROALL";
    
    const match = upperName.match(/^([A-Z]+)[#\s\-_0-9]/) || upperName.match(/^([A-Z]+)$/);
    return match ? match[1] : "OTHER";
  };
  
  // 根据业务类型和司机分配自动筛选车辆
  const filteredVehicles = useMemo(() => {
    const filtered = samsaraLocs.filter(truck => {
      // 1. 查找本地分配记录（关联了司机且本地库中有对应的车）
      const assignment = vehicleAssignments.find((a: any) => {
        const vehicleSamsaraId = a.vehicles?.samsara_id;
        if (vehicleSamsaraId && vehicleSamsaraId === truck.id) return true;
        
        const vehicleName = (a.vehicles?.name || "").toUpperCase();
        const truckName = (truck.name || "").toUpperCase();
        const cleanV = vehicleName.replace(/[^A-Z0-9]/g, '');
        const cleanT = truckName.replace(/[^A-Z0-9]/g, '');
        return cleanV === cleanT || vehicleName.includes(truckName) || truckName.includes(vehicleName);
      });

      // 如果没分配司机，不显示
      if (!assignment) return false;

      // 2. 根据本地车辆名称前缀过滤业务类型
      const localVName = (assignment.vehicles?.name || "").toUpperCase();
      if (businessType === 'garbage') {
        return localVName.startsWith('BIN');
      } else if (businessType === 'brick') {
        return localVName.startsWith('FLAT');
      }
      return true;
    });
    
    return filtered;
  }, [samsaraLocs, businessType, vehicleAssignments]);

  // 1. 加载 Google Maps JS 脚本 (原生方式最稳)
  useEffect(() => {
    if ((window as any).google && (window as any).google.maps) {
      setMapLoaded(true);
      return;
    }
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
    if (!apiKey) return;
    
    if (!document.querySelector('script[src*="maps.googleapis.com"]')) {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => setMapLoaded(true);
      document.head.appendChild(script);
    } else {
      // 脚本标签已存在但 API 尚未就绪 (例如快速切换页面再回来)
      // 轮询等待 Google Maps 加载完成
      const interval = setInterval(() => {
        if ((window as any).google && (window as any).google.maps) {
          clearInterval(interval);
          setMapLoaded(true);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  // 2. 初始化地图实例
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapInstance.current) return;
    
    mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
      zoom: 10,
      center: { lat: 43.75, lng: -79.4 },
      styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }],
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
    });
    
    infoWindowRef.current = new (window as any).google.maps.InfoWindow();

    // 渲染所有手动步骤固定地点 (可拖拽到司机 → 创建手动步骤)
    MANUAL_STEP_LOCATIONS.forEach(location => {
      const marker = new (window as any).google.maps.Marker({
        position: location.coordinates,
        map: mapInstance.current,
        icon: {
          url: createManualLocationIcon(location),
          scaledSize: new (window as any).google.maps.Size(45, 45),
          anchor: new (window as any).google.maps.Point(22.5, 45)
        },
        title: location.name,
        zIndex: 50,
        draggable: true,
        cursor: "grab",
      });
      
      // 存储原始坐标 (拖完要弹回)
      marker._originalPos = { lat: location.coordinates.lat, lng: location.coordinates.lng };
      marker._locationId = location.id;
      
      // 将固定地点标记也存储到markersRef中，用于路线绘制
      const markerId = `manual_${location.id}`;
      markersRef.current[markerId] = marker;

      // 拖拽处理: 和订单 marker 类似
      marker.addListener("dragstart", () => {
        marker.setZIndex(10000);
        if (mapInstance.current) {
          mapInstance.current.setOptions({ draggable: false, scrollwheel: false, disableDoubleClickZoom: true });
        }
        // 虚影
        const ghost = new (window as any).google.maps.Marker({
          map: mapInstance.current,
          position: marker._originalPos,
          icon: marker.getIcon(),
          zIndex: 40,
          clickable: false,
          opacity: 0.35,
        });
        marker._ghostMarker = ghost;
      });

      marker.addListener("drag", () => {
        const target = findDropTargetAtCursor();
        const driverId = target?.driverId ?? null;
        if (driverId !== hoverDriverRef.current) {
          hoverDriverRef.current = driverId;
          onDragHoverDriver?.(driverId);
        }
        if (target?.driverId && target.index !== undefined) {
          onDragHoverPosition?.({ driverId: target.driverId, index: target.index });
        } else {
          onDragHoverPosition?.(null);
        }
      });

      marker.addListener("dragend", () => {
        const target = findDropTargetAtCursor();
        onDragHoverDriver?.(null);
        onDragHoverPosition?.(null);
        hoverDriverRef.current = null;
        // 弹回原位
        marker.setPosition(marker._originalPos);
        marker.setZIndex(50);
        // 移除虚影
        if (marker._ghostMarker) { marker._ghostMarker.setMap(null); marker._ghostMarker = null; }
        // 恢复地图
        if (mapInstance.current) {
          mapInstance.current.setOptions({ draggable: true, scrollwheel: true, disableDoubleClickZoom: false });
        }
        // 命中司机 → 回调
        if (target?.driverId && onLocationDropRef.current) {
          onLocationDropRef.current(location.id, target.driverId, target.index);
        }
      });
      
      // 添加点击事件
      marker.addListener('click', () => {
        if (!infoWindowRef.current) return;
        const typeName = LOCATION_TYPE_NAMES[location.type] || location.type;
        infoWindowRef.current.setContent(`
          <div style="padding:10px;font-size:13px;color:black;min-width:200px;">
            <div style="font-weight:bold;font-size:15px;margin-bottom:8px;color:#333;">
              ${location.icon} ${location.name}
            </div>
            <div style="margin-bottom:4px;">
              <span style="font-weight:bold;color:#666;">类型:</span> 
              <span style="color:#2196F3;margin-left:4px;">${typeName}</span>
            </div>
            <div style="margin-bottom:4px;">
              <span style="font-weight:bold;color:#666;">简称:</span> 
              <span style="color:#4CAF50;margin-left:4px;">${location.shortName}</span>
            </div>
            <div style="margin-bottom:4px;">
              <span style="font-weight:bold;color:#666;">地址:</span> 
              <div style="color:#333;margin-top:2px;font-size:12px;">${location.fullAddress}</div>
            </div>
          </div>
        `);
        infoWindowRef.current.open(mapInstance.current, marker);
      });
    });
  }, [mapLoaded]);

  // 2b. 根据业务类型显示/隐藏固定地点标记
  useEffect(() => {
    if (!mapInstance.current) return;
    const visibleLocations = MANUAL_STEP_LOCATIONS.filter(loc =>
      loc.businessType === businessType || loc.businessType === 'all'
    );
    const visibleIds = new Set(visibleLocations.map(l => l.id));

    MANUAL_STEP_LOCATIONS.forEach(location => {
      const markerId = `manual_${location.id}`;
      const marker = markersRef.current[markerId];
      if (marker && marker.setMap) {
        // 对于砖厂, 只显示当天有取货单的
        if (location.type === 'brick_factory') {
          const isActive = activeBrickFactoryIds?.has(location.id);
          if (visibleIds.has(location.id) && isActive) {
            if (!marker.getMap()) marker.setMap(mapInstance.current);
          } else {
            marker.setMap(null);
          }
        } else {
          if (visibleIds.has(location.id)) {
            if (!marker.getMap()) marker.setMap(mapInstance.current);
          } else {
            marker.setMap(null);
          }
        }
      }
    });
  }, [businessType, mapLoaded, activeBrickFactoryIds]);

  // 3. Samsara 数据由上方的 useQuery 托管, 无需手动 setInterval

  // 4. 绘制地图标记 (车辆 & 订单)
  useEffect(() => {
    if (!mapInstance.current || !(window as any).google) return;
    
    console.log('🗺️ 开始绘制地图标记, businessType:', businessType, 'filteredVehicles:', filteredVehicles.length);
    
    const newMarkers: Record<string, any> = {};

    // 本轮需要保留的 truck id 集合 (只清掉不在这一批里的, 避免业务类型切换等时短暂为空导致闪烁)
    const currentTruckIds = new Set(filteredVehicles.map((t: any) => "truck_" + t.id));
    Object.keys(markersRef.current).forEach(key => {
      if (!key.startsWith('truck_')) return;
      // 若这个 truck 不在新列表里 → 移除
      if (!currentTruckIds.has(key)) {
        const m = markersRef.current[key];
        if (m && m !== "pending") m.setMap(null);
        delete markersRef.current[key];
      }
    });

    // 绘制真实车辆 (直接来自 Samsara)
    filteredVehicles.forEach(truck => {
      const name = truck.name || "";
      if (!name) return;
      
      const id = "truck_" + truck.id;
      const lat = truck.location?.latitude;
      const lng = truck.location?.longitude;
      if (!lat || !lng) return;

      const vehicleType = extractVehicleType(name);
      
      // 查找分配给该车辆的司机 - 使用多种匹配方式
      let assignment = null;
      
      // 方法1: 通过 samsara_id 精确匹配
      assignment = vehicleAssignments.find((a: any) => {
        const vehicleSamsaraId = a.vehicles?.samsara_id;
        return vehicleSamsaraId && vehicleSamsaraId === truck.id;
      });
      
      // 方法2: 如果方法1失败，通过车辆名称模糊匹配
      if (!assignment) {
        assignment = vehicleAssignments.find((a: any) => {
          const vehicleName = (a.vehicles?.name || "").toUpperCase();
          const truckName = name.toUpperCase();
          // 移除空格和特殊字符后比较
          const cleanVehicleName = vehicleName.replace(/[^A-Z0-9]/g, '');
          const cleanTruckName = truckName.replace(/[^A-Z0-9]/g, '');
          return cleanVehicleName === cleanTruckName || 
                 vehicleName.includes(truckName) || 
                 truckName.includes(vehicleName);
        });
      }
      
      const driverName = assignment ? (assignment.profiles?.name || "已分配") : "";
      // 使用车辆的 type 字段（HINO 或 MACK），如果没有则使用提取的类型
      const vehicleTypeName = assignment?.vehicles?.type || vehicleType;
      
      // 创建标签文本：使用车辆 type (HINO/MACK) + 驾驶员
      const labelText = driverName ? `${vehicleTypeName} ${driverName}` : vehicleTypeName;
      
      // 创建自定义车辆图标（带标签）- 传入 vehicleTypeName 而不是 vehicleType
      const iconUrl = createVehicleIconWithLabel(vehicleTypeName, driverName);

      const marker = markersRef.current[id] || new (window as any).google.maps.Marker({
        map: mapInstance.current,
        icon: {
            url: iconUrl,
            scaledSize: new (window as any).google.maps.Size(110, 60),
            anchor: new (window as any).google.maps.Point(55, 55) // 锚点在底部中心
        },
        zIndex: 1000
      });

      marker.setPosition({ lat, lng });
      
      // 更新图标（如果司机分配改变）
      const newIconUrl = createVehicleIconWithLabel(vehicleTypeName, driverName);
      if (marker.getIcon()?.url !== newIconUrl) {
        marker.setIcon({
          url: newIconUrl,
          scaledSize: new (window as any).google.maps.Size(110, 60),
          anchor: new (window as any).google.maps.Point(55, 55)
        });
      }
      
      newMarkers[id] = marker;
      
      // 添加点击事件显示车辆信息
      if (!marker.clickListenerAdded) {
        marker.addListener('click', () => {
          if (!infoWindowRef.current) return;
          
          const driverInfo = driverName || "未分配";
            
          infoWindowRef.current.setContent(`
            <div style="padding:8px;font-size:12px;color:black;min-width:150px;">
              <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">${name}</div>
              <div style="color:#666;margin-bottom:4px;">
                <strong>车型:</strong> ${vehicleTypeName}
              </div>
              <div style="color:#666;margin-bottom:4px;">
                <strong>驾驶员:</strong> ${driverInfo}
              </div>
              <div style="color:#666;margin-bottom:4px;">
                <strong>Samsara ID:</strong> ${truck.id}
              </div>
              <div style="color:#666;">
                <strong>位置:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}
              </div>
            </div>
          `);
          infoWindowRef.current.open(mapInstance.current, marker);
        });
        marker.clickListenerAdded = true;
      }
    });

    // 绘制订单
    const geocoder = new (window as any).google.maps.Geocoder();

    // 为订单 marker 绑定拖拽处理 (未分配 + 已分配订单都可拖)
    // - dragstart: 冻结地图 (防止边界 panning), 原位留虚影, 提高 marker zIndex
    // - drag:      找鼠标下方目标 (司机 / 精确位置), 回调让 UI 做高亮
    // - dragend:   释放时决定动作:
    //              * 命中司机 (有索引) → onAssignOrder(orderId, driverId, index)
    //              * 命中司机 (无索引) → onAssignOrder(orderId, driverId) 放末尾
    //              * 未命中 → onUnassignOrder(orderId) (把已分配订单拖到空白 = 取消分配)
    //              marker 永远弹回原位; 虚影移除; 地图恢复可拖
    const attachOrderDragHandlers = (marker: any, order: any) => {
      if (marker._dragHandlersAttached) return;
      marker._dragHandlersAttached = true;

      marker.addListener("dragstart", () => {
        currentDraggingOrderRef.current = order.id;
        hoverDriverRef.current = null;
        marker.setZIndex(10000);
        onMapDragOrder?.(order.id);

        // 清理可能残留的旧虚影
        if (marker._ghostMarker) {
          marker._ghostMarker.setMap(null);
          marker._ghostMarker = null;
        }

        // 冻结地图, 防止拖到地图边缘触发地图 pan
        if (mapInstance.current) {
          mapInstance.current.setOptions({
            draggable: false,
            scrollwheel: false,
            disableDoubleClickZoom: true,
          });
        }

        // 在原坐标创建虚影 marker (半透明)
        const origPos = marker._originalPos || marker.getPosition();
        if (origPos && mapInstance.current && (window as any).google) {
          const ghost = new (window as any).google.maps.Marker({
            map: mapInstance.current,
            position: origPos,
            icon: marker.getIcon(),
            zIndex: 400,
            clickable: false,
            opacity: 0.35,
          });
          marker._ghostMarker = ghost;
        }
      });

      marker.addListener("drag", () => {
        const target = findDropTargetAtCursor();
        const driverId = target?.driverId ?? null;
        if (driverId !== hoverDriverRef.current) {
          hoverDriverRef.current = driverId;
          onDragHoverDriver?.(driverId);
        }
        if (target?.driverId && target.index !== undefined) {
          onDragHoverPosition?.({ driverId: target.driverId, index: target.index });
        } else {
          onDragHoverPosition?.(null);
        }
      });

      marker.addListener("dragend", () => {
        const target = findDropTargetAtCursor();
        onDragHoverDriver?.(null);
        onDragHoverPosition?.(null);
        hoverDriverRef.current = null;
        currentDraggingOrderRef.current = null;
        onMapDragOrder?.(null);

        // 弹回原位
        if (marker._originalPos) {
          marker.setPosition(marker._originalPos);
        }
        marker.setZIndex(500);

        // 移除虚影
        if (marker._ghostMarker) {
          marker._ghostMarker.setMap(null);
          marker._ghostMarker = null;
        }

        // 恢复地图可拖
        if (mapInstance.current) {
          mapInstance.current.setOptions({
            draggable: true,
            scrollwheel: true,
            disableDoubleClickZoom: false,
          });
        }

        if (target?.driverId) {
          onAssignOrder?.(order.id, target.driverId, target.index);
        } else {
          // 没命中司机 → 如果订单原本是已分配的, 就取消分配
          const wasUnassigned = unassignedOrderSet.has(order.id);
          if (!wasUnassigned) {
            onUnassignOrder?.(order.id);
          }
        }
      });
    };

    // ===== 按地址聚合订单: 同一地址多个订单只显示一个 cluster marker =====
    const activeOrders = orders.filter(o => o.status !== 'done' && !o.completed);
    // 按 geocode 地址 key 分组
    const ordersByAddress: Record<string, any[]> = {};
    activeOrders.forEach(order => {
      if (!order.address) return;
      const geoAddr = order.address.toLowerCase().includes('on') ? order.address : `${order.address}, Toronto, ON, Canada`;
      (ordersByAddress[geoAddr] ??= []).push(order);
    });

    // 辅助: 创建单个订单 marker 的 click handler
    const makeOrderClickHandler = (marker: any, order: any, orderETA: any) => () => {
      // 通知父组件点击了哪个订单 (用于左侧高亮)
      onOrderClick?.(order.id);
      if (!infoWindowRef.current) return;
      const dn = assignments.find((a: any) => a.order_id === order.id)?.driver_id
        ? drivers.find((d: any) => d.id === assignments.find((a: any) => a.order_id === order.id)?.driver_id)?.name : "未分配";
      const td = order.time_window_custom || order.time_window || '—';
      const btnm: Record<string, string> = { garbage: '垃圾桶', brick: '砖桶', soil: '土桶', cement: '水泥桶', asphalt: '沥青桶' };
      const bn = btnm[order.bin_type] || '—';
      const eta = orderETA && orderETA.status === 'OK'
        ? `<div style="margin-bottom:4px;"><span style="font-weight:bold;color:#666;">预计到达:</span> <span style="color:#2196F3;margin-left:4px;">${new Date(orderETA.eta).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></div>` : '';
      infoWindowRef.current.setContent(`<div style="padding:8px;font-size:12px;color:black;min-width:180px;"><div style="font-weight:bold;font-size:14px;margin-bottom:6px;color:#333;">${order.order_number || order.id}</div><div style="margin-bottom:4px;"><span style="font-weight:bold;color:#666;">类型:</span> <span style="color:#2196F3;margin-left:4px;">${order.type}</span></div><div style="margin-bottom:4px;"><span style="font-weight:bold;color:#666;">桶类型:</span> <span style="color:#FF5722;margin-left:4px;">${bn}</span></div><div style="margin-bottom:4px;"><span style="font-weight:bold;color:#666;">尺寸:</span> <span style="color:#4CAF50;margin-left:4px;">${order.bin_size || '—'}</span></div><div style="margin-bottom:4px;"><span style="font-weight:bold;color:#666;">时段:</span> <span style="color:#9C27B0;margin-left:4px;">${td}</span></div>${eta}<div style="margin-bottom:6px;"><span style="font-weight:bold;color:#666;">地址:</span><div style="color:#333;margin-top:2px;font-size:11px;">${order.address}</div></div><div style="margin-bottom:4px;"><span style="font-weight:bold;color:#666;">驾驶员:</span> <span style="color:#FF9800;margin-left:4px;">${dn}</span></div></div>`);
      infoWindowRef.current.open(mapInstance.current, marker);
    };

    // 辅助: 创建聚合 marker 的 click handler
    const makeClusterClickHandler = (marker: any) => () => {
      if (!infoWindowRef.current) return;
      const clusterOrders = marker._clusterOrders || [];
      const ordersHtml = clusterOrders.map((o: any) => {
        const tm = o.type === 'delivery' ? '送桶' : o.type === 'pickup' ? '收桶' : o.type === 'swap' ? '换桶' : o.type;
        const asg = assignments.find((a: any) => a.order_id === o.id);
        const dn = asg ? drivers.find((d: any) => d.id === asg.driver_id)?.name || '已分配' : '未分配';
        const td = o.time_window_custom || o.time_window || '';
        const sc = asg ? '#4CAF50' : '#FF9800';
        return `<div style="padding:6px 0;border-bottom:1px solid #eee;"><div style="font-weight:bold;font-size:12px;color:#333;">${o.order_number} · ${tm} ${o.bin_size ? o.bin_size + 'yd' : ''}</div><div style="font-size:10px;color:#666;margin-top:2px;">${td} · <span style="color:${sc}">${dn}</span></div></div>`;
      }).join('');
      infoWindowRef.current.setContent(`<div style="padding:8px;font-size:12px;color:black;min-width:220px;max-height:300px;overflow-y:auto;"><div style="font-weight:bold;font-size:13px;margin-bottom:8px;color:#333;border-bottom:2px solid #2196F3;padding-bottom:4px;">📍 ${clusterOrders[0]?.address || ''}</div><div style="font-size:11px;color:#666;margin-bottom:6px;">${clusterOrders.length} 个订单</div>${ordersHtml}</div>`);
      infoWindowRef.current.open(mapInstance.current, marker);
    };

    Object.entries(ordersByAddress).forEach(([geocodeAddress, groupOrders]) => {
      const isCluster = groupOrders.length > 1;
      const clusterId = `cluster_${geocodeAddress}`;

      // --- 单个订单: 保持原有逻辑 ---
      if (!isCluster) {
        const order = groupOrders[0];
        const id = "order_" + order.id;
        let orderETA = null;
        for (const did in driverETAs) {
          const f = driverETAs[did]?.orders?.find((o: any) => o.orderId === order.id);
          if (f) { orderETA = f; break; }
        }
        // 已有 marker → 复用
        if (markersRef.current[id] && markersRef.current[id] !== "pending") {
          const marker = markersRef.current[id];
          if (marker.getMap && !marker.getMap()) marker.setMap(mapInstance.current);
          updateOrderIcon(marker, order, assignments, drivers, orderETA, unassignedOrderSet.has(order.id));
          const shouldDrag = draggableOrderSet.has(order.id) && (!!onAssignOrder || !!onUnassignOrder);
          if (marker.getDraggable && marker.getDraggable() !== shouldDrag) marker.setDraggable(shouldDrag);
          if (shouldDrag && marker.getPosition && !marker._originalPos) { const p = marker.getPosition(); marker._originalPos = { lat: p.lat(), lng: p.lng() }; }
          attachOrderDragHandlers(marker, order);
          newMarkers[id] = marker;
          return;
        }
        // 需要创建
        const cached = geocodeCacheRef.current[geocodeAddress];
        if (cached) {
          const pos = new (window as any).google.maps.LatLng(cached.lat, cached.lng);
          const isDraggable = draggableOrderSet.has(order.id) && (!!onAssignOrder || !!onUnassignOrder);
          const marker = new (window as any).google.maps.Marker({ map: mapInstance.current, position: pos, title: order.order_number || order.id, zIndex: 500, draggable: isDraggable, cursor: isDraggable ? "grab" : undefined });
          if (isDraggable) marker._originalPos = { lat: cached.lat, lng: cached.lng };
          updateOrderIcon(marker, order, assignments, drivers, orderETA, unassignedOrderSet.has(order.id));
          attachOrderDragHandlers(marker, order);
          marker.addListener('click', makeOrderClickHandler(marker, order, orderETA));
          markersRef.current[id] = marker;
          newMarkers[id] = marker;
        } else {
          newMarkers[id] = "pending";
          geocoder.geocode({ address: geocodeAddress }, (results: any, status: any) => {
            if (status === "OK" && results?.[0]) {
              const pos = results[0].geometry.location;
              geocodeCacheRef.current[geocodeAddress] = { lat: pos.lat(), lng: pos.lng() };
              saveGeocodeCache(geocodeCacheRef.current);
              const isDraggable = draggableOrderSet.has(order.id) && (!!onAssignOrder || !!onUnassignOrder);
              const marker = new (window as any).google.maps.Marker({ map: mapInstance.current, position: pos, title: order.order_number || order.id, zIndex: 500, draggable: isDraggable, cursor: isDraggable ? "grab" : undefined });
              if (isDraggable) marker._originalPos = { lat: pos.lat(), lng: pos.lng() };
              updateOrderIcon(marker, order, assignments, drivers, orderETA, unassignedOrderSet.has(order.id));
              attachOrderDragHandlers(marker, order);
              marker.addListener('click', makeOrderClickHandler(marker, order, orderETA));
              markersRef.current[id] = marker;
            } else { console.warn(`地址解析失败: ${order.order_number} - ${order.address}`); }
          });
        }
        return;
      }

      // --- 聚合 marker (同地址多个订单) ---
      // 已有聚合 marker → 更新
      if (markersRef.current[clusterId] && markersRef.current[clusterId] !== "pending") {
        const marker = markersRef.current[clusterId];
        if (marker.getMap && !marker.getMap()) marker.setMap(mapInstance.current);
        marker.setIcon(createClusterIcon(groupOrders.length, groupOrders.some(o => unassignedOrderSet.has(o.id))));
        marker._clusterOrders = groupOrders;
        newMarkers[clusterId] = marker;
        groupOrders.forEach(o => { newMarkers["order_" + o.id] = "cluster"; });
        return;
      }

      // 需要创建聚合 marker
      const cached = geocodeCacheRef.current[geocodeAddress];
      if (cached) {
        const pos = new (window as any).google.maps.LatLng(cached.lat, cached.lng);
        const marker = new (window as any).google.maps.Marker({ map: mapInstance.current, position: pos, icon: createClusterIcon(groupOrders.length, groupOrders.some(o => unassignedOrderSet.has(o.id))), title: `${groupOrders.length} 个订单`, zIndex: 600 });
        marker._clusterOrders = groupOrders;
        marker._originalPos = { lat: cached.lat, lng: cached.lng };
        marker.addListener('click', makeClusterClickHandler(marker));
        markersRef.current[clusterId] = marker;
        newMarkers[clusterId] = marker;
        groupOrders.forEach(o => { newMarkers["order_" + o.id] = "cluster"; });
      } else {
        newMarkers[clusterId] = "pending";
        groupOrders.forEach(o => { newMarkers["order_" + o.id] = "cluster"; });
        geocoder.geocode({ address: geocodeAddress }, (results: any, status: any) => {
          if (status === "OK" && results?.[0]) {
            const pos = results[0].geometry.location;
            geocodeCacheRef.current[geocodeAddress] = { lat: pos.lat(), lng: pos.lng() };
            saveGeocodeCache(geocodeCacheRef.current);
            const marker = new (window as any).google.maps.Marker({ map: mapInstance.current, position: pos, icon: createClusterIcon(groupOrders.length, groupOrders.some(o => unassignedOrderSet.has(o.id))), title: `${groupOrders.length} 个订单`, zIndex: 600 });
            marker._clusterOrders = groupOrders;
            marker._originalPos = { lat: pos.lat(), lng: pos.lng() };
            marker.addListener('click', makeClusterClickHandler(marker));
            markersRef.current[clusterId] = marker;
          } else { console.warn(`地址解析失败: ${geocodeAddress}`); }
        });
      }
    });

    // 清理不再显示的 markers（但保留固定地点标记和聚合子订单占位）
    Object.keys(markersRef.current).forEach(key => {
      // 跳过固定地点标记（以manual_开头）
      if (key.startsWith('manual_')) return;

      if (markersRef.current[key] && markersRef.current[key] !== "pending" && markersRef.current[key] !== "cluster" && !newMarkers[key]) {
        if (markersRef.current[key].setMap) markersRef.current[key].setMap(null);
        delete markersRef.current[key];
      }
    });
    
    // 更新
    Object.keys(newMarkers).forEach(key => {
      if (newMarkers[key] !== "pending" && newMarkers[key] !== "cluster") {
        markersRef.current[key] = newMarkers[key];
      }
    });

  }, [orders, assignments, filteredVehicles, drivers, mapLoaded, vehicleAssignments, driverETAs, businessType, unassignedOrderSet, draggableOrderSet, onAssignOrder, onUnassignOrder, onDragHoverDriver, onDragHoverPosition, onOrderClick, driverDropZoneAttr, dropPositionAttr]);

  // 5. 绘制ETA路线
  useEffect(() => {
    if (!mapInstance.current || !(window as any).google || !driverETAs) return;
    
    // 清除旧的路线
    routeLinesRef.current.forEach(line => line.setMap(null));
    routeLinesRef.current = [];
    
    // 延迟绘制，确保标记已经创建
    const drawRoutes = () => {
      // 为每个有ETA数据的司机绘制路线
      Object.values(driverETAs).forEach((driverETA: any) => {
        if (!driverETA || !driverETA.currentLocation || !driverETA.orders || driverETA.orders.length === 0) {
          return;
        }
        
        // 构建路径点：车辆当前位置 -> 各个任务点
        const pathCoordinates = [
          { lat: driverETA.currentLocation.lat, lng: driverETA.currentLocation.lng }
        ];
        
        // 为每个任务点添加坐标
        driverETA.orders.forEach((orderETA: any) => {
          // 先尝试从订单标记中获取
          let markerId = `order_${orderETA.orderId}`;
          let marker = markersRef.current[markerId];
          
          // 如果不是订单标记，尝试从手动步骤固定地点中获取
          if (!marker || marker === "pending") {
            // 查找匹配的固定地点
            const location = MANUAL_STEP_LOCATIONS.find(loc => 
              orderETA.orderAddress.toLowerCase().includes(loc.shortName.toLowerCase()) ||
              orderETA.orderAddress.toLowerCase().includes(loc.fullAddress.toLowerCase())
            );
            
            if (location) {
              markerId = `manual_${location.id}`;
              marker = markersRef.current[markerId];
            }
          }
          
          if (marker && marker !== "pending" && marker.getPosition) {
            const pos = marker.getPosition();
            pathCoordinates.push({ lat: pos.lat(), lng: pos.lng() });
          }
        });
        
        if (pathCoordinates.length < 2) return;
        
        // 为不同司机使用不同颜色
        const colors = ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'];
        const colorIndex = Object.keys(driverETAs).indexOf(driverETA.driverId) % colors.length;
        const lineColor = colors[colorIndex];
        
        // 绘制路线折线
        const routeLine = new (window as any).google.maps.Polyline({
          path: pathCoordinates,
          geodesic: true,
          strokeColor: lineColor,
          strokeOpacity: 0.8,
          strokeWeight: 4,
          map: mapInstance.current,
          zIndex: 100,
          icons: [{
            icon: {
              path: (window as any).google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 3,
              strokeColor: lineColor,
              strokeWeight: 2,
              fillColor: lineColor,
              fillOpacity: 1
            },
            offset: '100%',
            repeat: '150px' // 每150像素显示一个箭头
          }]
        });
        
        routeLinesRef.current.push(routeLine);
        
        // 在每个任务点添加序号标记
        pathCoordinates.forEach((coord, index) => {
          if (index === 0) return; // 跳过起点（车辆位置）
          
          const numberMarker = new (window as any).google.maps.Marker({
            position: coord,
            map: mapInstance.current,
            icon: {
              url: createNumberIcon(index, lineColor),
              scaledSize: new (window as any).google.maps.Size(24, 24),
              anchor: new (window as any).google.maps.Point(12, 12)
            },
            zIndex: 1000
          });
          
          routeLinesRef.current.push(numberMarker);
        });
      });
    };
    
    // 延迟500ms绘制，确保所有标记都已创建
    const timeoutId = setTimeout(drawRoutes, 500);
    
    return () => clearTimeout(timeoutId);
  }, [driverETAs, mapLoaded]);

  // 6. 绘制拖拽预览路线 (虚线, 拖拽订单悬停在司机上时显示)
  useEffect(() => {
    // 清除旧的预览线
    if (previewLineRef.current) {
      previewLineRef.current.setMap(null);
      previewLineRef.current = null;
    }

    if (!mapInstance.current || !(window as any).google || !previewRoute || previewRoute.length < 2) {
      return;
    }

    // 绘制虚线预览路线
    const line = new (window as any).google.maps.Polyline({
      path: previewRoute,
      geodesic: true,
      strokeColor: '#FF6D00',
      strokeOpacity: 0,
      strokeWeight: 3,
      map: mapInstance.current,
      zIndex: 200,
      icons: [{
        icon: {
          path: 'M 0,-1 0,1',
          strokeOpacity: 0.9,
          strokeColor: '#FF6D00',
          strokeWeight: 3,
          scale: 3,
        },
        offset: '0',
        repeat: '15px',
      }, {
        icon: {
          path: (window as any).google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 3,
          strokeColor: '#FF6D00',
          strokeWeight: 2,
          fillColor: '#FF6D00',
          fillOpacity: 0.9,
        },
        offset: '100%',
        repeat: '120px',
      }],
    });

    previewLineRef.current = line;

    return () => {
      if (previewLineRef.current) {
        previewLineRef.current.setMap(null);
        previewLineRef.current = null;
      }
    };
  }, [previewRoute, mapLoaded]);

  // 7. 绘制悬停司机路线高亮 (实线, 悬停在司机名字上时显示)
  useEffect(() => {
    if (hoverLineRef.current) {
      hoverLineRef.current.setMap(null);
      hoverLineRef.current = null;
    }

    if (!mapInstance.current || !(window as any).google || !hoverRoute || hoverRoute.length < 2) {
      return;
    }

    const line = new (window as any).google.maps.Polyline({
      path: hoverRoute,
      geodesic: true,
      strokeColor: '#2196F3',
      strokeOpacity: 0.7,
      strokeWeight: 3,
      map: mapInstance.current,
      zIndex: 150,
      icons: [{
        icon: {
          path: (window as any).google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 2.5,
          strokeColor: '#2196F3',
          strokeWeight: 2,
          fillColor: '#2196F3',
          fillOpacity: 0.8,
        },
        offset: '100%',
        repeat: '100px',
      }],
    });

    hoverLineRef.current = line;

    return () => {
      if (hoverLineRef.current) {
        hoverLineRef.current.setMap(null);
        hoverLineRef.current = null;
      }
    };
  }, [hoverRoute, mapLoaded]);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  if (!apiKey) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-card border rounded-lg p-6 text-center text-muted-foreground">
        <p className="font-bold text-foreground">缺少 Google Maps API 密钥</p>
        <p className="text-sm mt-1">请在 .env 文件中添加 VITE_GOOGLE_MAPS_API_KEY 变量，然后重启服务。</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative rounded-lg border overflow-hidden">
      <div id="map" ref={mapRef} className="w-full h-full bg-muted/10 min-h-[300px]"></div>
    </div>
  );
}

// 辅助函数: 创建聚合 marker 图标 (圆形 + 数字)
function createClusterIcon(count: number, hasUnassigned: boolean): any {
  const bg = hasUnassigned ? '#FF9800' : '#2196F3';
  const border = hasUnassigned ? '#E65100' : '#1565C0';
  const size = Math.min(48, 32 + count * 4);
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>
      <circle cx='${size/2}' cy='${size/2}' r='${size/2 - 2}' fill='${bg}' stroke='${border}' stroke-width='2'/>
      <text x='${size/2}' y='${size/2 + 5}' text-anchor='middle' font-size='14' font-weight='bold' fill='white'>${count}</text>
    </svg>
  `;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new (window as any).google.maps.Size(size, size),
    anchor: new (window as any).google.maps.Point(size/2, size/2),
  };
}

// 辅助函数: 创建带标签的车辆图标
function createVehicleIconWithLabel(vehicleType: string, driverName: string): string {
  // 为每种车辆类型定义配色方案（背景色 + 文字色）
  const colorSchemes: Record<string, { bg: string; text: string; truck: string }> = {
    'BIN': { bg: '#FFC107', text: '#000000', truck: '#FFC107' },      // 黄底黑字
    'FLAT': { bg: '#2196F3', text: '#FFFFFF', truck: '#2196F3' },     // 蓝底白字
    'DUMP': { bg: '#9C27B0', text: '#FFFFFF', truck: '#9C27B0' },     // 紫底白字
    'PROALL': { bg: '#FF9800', text: '#FFFFFF', truck: '#FF9800' },   // 橙底白字
    'HINO': { bg: '#F44336', text: '#FFFFFF', truck: '#F44336' },     // 红底白字
    'MACK': { bg: '#607D8B', text: '#FFFFFF', truck: '#607D8B' },     // 灰底白字
    'TRUCK': { bg: '#795548', text: '#FFFFFF', truck: '#795548' }     // 棕底白字
  };
  
  const scheme = colorSchemes[vehicleType] || { bg: '#795548', text: '#FFFFFF', truck: '#795548' };
  
  // 创建标签文本
  const labelText = driverName ? `${vehicleType}(${driverName})` : vehicleType;
  
  // 固定宽度，确保所有车辆图标大小一致
  const cardWidth = 100;
  const svgWidth = 110;
  
  // SVG 总高度：标签卡片(22) + 间距(2) + 卡车图标(28) = 52
  const svgHeight = 60;
  const cardX = (svgWidth - cardWidth) / 2;
  const truckX = (svgWidth - 28) / 2;
  
  // 创建SVG，包含顶部标签卡片和底部卡车图标
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='${svgWidth}' height='${svgHeight}' viewBox='0 0 ${svgWidth} ${svgHeight}'>
      <!-- 顶部标签卡片 - 有色背景 + 对比色文字 + 阴影 -->
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
        </filter>
      </defs>
      <rect x='${cardX}' y='0' width='${cardWidth}' height='22' rx='4' fill='${scheme.bg}' stroke='#333' stroke-width='1.5' opacity='0.98' filter="url(#shadow)"/>
      <text x='${svgWidth/2}' y='15' text-anchor='middle' font-size='12' font-weight='bold' fill='${scheme.text}' font-family='Arial, sans-serif'>${labelText}</text>
      
      <!-- 连接线 -->
      <line x1='${svgWidth/2}' y1='22' x2='${svgWidth/2}' y2='24' stroke='${scheme.bg}' stroke-width='2'/>
      
      <!-- 底部卡车图标 - 稍大一些 -->
      <g transform='translate(${truckX}, 24)'>
        <!-- 车身 -->
        <rect x='3' y='10' width='22' height='11' rx='2' fill='${scheme.truck}' stroke='#000' stroke-width='1.5'/>
        <!-- 车轮 -->
        <circle cx='8' cy='21' r='2.5' fill='#222' stroke='#000' stroke-width='1'/>
        <circle cx='20' cy='21' r='2.5' fill='#222' stroke='#000' stroke-width='1'/>
        <!-- 驾驶室 -->
        <rect x='5' y='5' width='18' height='5' rx='1' fill='${scheme.truck}' stroke='#000' stroke-width='1.5'/>
        <!-- 车窗 -->
        <rect x='7' y='6' width='5' height='3' rx='0.5' fill='#87CEEB' opacity='0.7'/>
        <rect x='16' y='6' width='5' height='3' rx='0.5' fill='#87CEEB' opacity='0.7'/>
      </g>
    </svg>
  `.trim();
  
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// 辅助函数: 创建订单标记 (紧凑徽章: 主信息 + 地址 + HINO 提示)
function createOrderIconWithLabel(order: any, orderETA?: any, isUnassigned: boolean = false, driverName?: string): string {
  // 订单类型配色
  const colorSchemes: Record<string, { bg: string; text: string; border: string; addr: string }> = {
    'delivery': { bg: '#2196F3', text: '#FFFFFF', border: '#0D47A1', addr: '#E3F2FD' },  // 蓝
    'pickup':   { bg: '#4CAF50', text: '#FFFFFF', border: '#1B5E20', addr: '#E8F5E9' },  // 绿
    'swap':     { bg: '#9C27B0', text: '#FFFFFF', border: '#4A148C', addr: '#F3E5F5' },  // 紫
  };
  const baseScheme = colorSchemes[order.type] || { bg: '#FF9800', text: '#FFFFFF', border: '#E65100', addr: '#FFF3E0' };
  // 未分配订单: 灰色底 + 警示边, 明显区分于已分配
  const scheme = isUnassigned
    ? { bg: '#F57C00', text: '#FFFFFF', border: '#BF360C', addr: '#FFF3E0' }
    : baseScheme;

  const typeNames: Record<string, string> = { delivery: '送', pickup: '收', swap: '换', material: '料' };
  const typeName = typeNames[order.type] || order.type;

  const binTypeEmojis: Record<string, string> = { garbage: '🗑', brick: '🧱', soil: '🪨', cement: '🏗', asphalt: '🛣' };
  const binEmoji = binTypeEmojis[order.bin_type] || '';

  const binSize = order.bin_size ? `${order.bin_size}yd` : '';
  const timeDisplay = order.time_window_custom || order.time_window || '';

  // 主徽章: 类型 + 尺寸 + 时段 (未分配订单前面加 ⇢ 提示可拖拽)
  const mainParts = [typeName, binSize, timeDisplay].filter(Boolean);
  const prefix = isUnassigned ? '⇢ ' : '';
  const mainText = prefix + (binEmoji ? binEmoji + ' ' : '') + mainParts.join(' · ');

  // 司机名: 分配后显示, 单独一条小胶囊 (只显示前 6 个字, 避免过长)
  const driverShort = driverName
    ? (driverName.length > 6 ? driverName.slice(0, 6) : driverName)
    : '';

  // 地址第二行: 只保留街号+街名和城市 (例: "102 Fenelon Dr, North York")
  const extractAddr = (addr: string): string => {
    if (!addr) return '';
    const parts = addr.split(',').map(p => p.trim());
    if (parts.length < 2) return parts[0] || '';
    const street = parts[0];
    const city = parts[1].split(/\s+/)[0];
    return `${street}, ${city}`;
  };
  const addrText = extractAddr(order.address);

  // HINO 标记: 备注里提到 hino (大小写都认) 说明仅 HINO 车可开
  const hasHinoFlag = /\bhino\b/i.test(order.customer_notes || '');

  // ETA 右上角小徽章
  let etaText = '';
  if (orderETA && orderETA.status === 'OK') {
    etaText = new Date(orderETA.eta).toLocaleTimeString('zh-CN', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  // 宽度按最宽那行计算 (padding 收紧, 避免空白)
  const charW = (s: string) => s.split('').reduce((w, c) => w + (/[\u4e00-\u9fa5🗑🧱🪨🏗🛣]/.test(c) ? 13 : 6.5), 0);
  const mainW = charW(mainText);
  const addrW = charW(addrText);
  const driverW = driverShort ? charW('👤 ' + driverShort) + 10 : 0;
  const badgeWidth = Math.max(mainW, addrW, driverW) + 12;
  const badgeWidthClamped = Math.min(Math.max(badgeWidth, 60), 170);
  const svgWidth = badgeWidthClamped + (etaText ? 42 : 6);

  // 行高收紧: 司机条 12 (可选), 主行 20, 地址行 14, HINO 条 13
  const driverRowH = driverShort ? 12 : 0;
  const mainH = 20;
  const addrH = addrText ? 14 : 0;
  const hinoH = hasHinoFlag ? 13 : 0;
  const gap = 1;
  const stackH = driverRowH + (driverRowH ? gap : 0) + mainH + (addrH ? addrH + gap : 0) + (hinoH ? hinoH + gap : 0);
  const svgHeight = stackH + 4 + 10; // + 连接线 + 图钉

  const badgeX = 3;
  const pinCx = badgeX + badgeWidthClamped / 2;
  const driverY = 0;
  const mainY = driverRowH + (driverRowH ? gap : 0);
  const addrY = mainY + mainH + gap;
  const hinoY = addrY + addrH + (addrH ? gap : 0);
  const pinY = stackH;

  const svg = `
<svg xmlns='http://www.w3.org/2000/svg' width='${svgWidth}' height='${svgHeight}' viewBox='0 0 ${svgWidth} ${svgHeight}'>
  <defs>
    <filter id='s' x='-20%' y='-20%' width='140%' height='140%'>
      <feDropShadow dx='0' dy='1' stdDeviation='1' flood-opacity='0.3'/>
    </filter>
  </defs>

  ${driverShort ? `
  <!-- 司机名小条 (只在分配后显示) -->
  <rect x='${badgeX}' y='${driverY}' width='${badgeWidthClamped}' height='${driverRowH}' rx='4'
        fill='#263238' stroke='${scheme.border}' stroke-width='0.6'/>
  <text x='${pinCx}' y='${driverY + 9}' text-anchor='middle' font-size='9' font-weight='bold' fill='#FFFFFF'
        font-family='-apple-system, "Segoe UI", Roboto, Arial, sans-serif'>👤 ${escapeXml(driverShort)}</text>
  ` : ''}

  <!-- 主徽章 -->
  <rect x='${badgeX}' y='${mainY}' width='${badgeWidthClamped}' height='${mainH}' rx='10'
        fill='${scheme.bg}' stroke='${scheme.border}' stroke-width='${isUnassigned ? 1.8 : 1.2}'
        ${isUnassigned ? "stroke-dasharray='4 2'" : ''} filter='url(#s)'/>
  <text x='${pinCx}' y='${mainY + 14}' text-anchor='middle' font-size='11' font-weight='bold' fill='${scheme.text}'
        font-family='-apple-system, "Segoe UI", Roboto, Arial, sans-serif'>${escapeXml(mainText)}</text>

  ${addrText ? `
  <!-- 地址行 -->
  <rect x='${badgeX}' y='${addrY}' width='${badgeWidthClamped}' height='${addrH}' rx='6'
        fill='${scheme.addr}' stroke='${scheme.border}' stroke-width='0.8'/>
  <text x='${pinCx}' y='${addrY + 10}' text-anchor='middle' font-size='9' font-weight='600' fill='${scheme.border}'
        font-family='-apple-system, "Segoe UI", Roboto, Arial, sans-serif'>${escapeXml(addrText)}</text>
  ` : ''}

  ${hasHinoFlag ? `
  <!-- HINO 警告条 -->
  <rect x='${badgeX}' y='${hinoY}' width='${badgeWidthClamped}' height='${hinoH}' rx='5'
        fill='#FFE082' stroke='#F57F17' stroke-width='0.8'/>
  <text x='${pinCx}' y='${hinoY + 9}' text-anchor='middle' font-size='8.5' font-weight='bold' fill='#BF360C'
        font-family='-apple-system, "Segoe UI", Roboto, Arial, sans-serif'>⚠ HINO 专用</text>
  ` : ''}

  ${etaText ? `
  <!-- ETA 右上角小徽章 -->
  <rect x='${badgeX + badgeWidthClamped + 3}' y='${mainY + 1}' width='36' height='16' rx='8'
        fill='#FFD54F' stroke='#F57F17' stroke-width='0.8' filter='url(#s)'/>
  <text x='${badgeX + badgeWidthClamped + 21}' y='${mainY + 13}' text-anchor='middle' font-size='9.5' font-weight='bold' fill='#333'
        font-family='-apple-system, "Segoe UI", Roboto, Arial, sans-serif'>${etaText}</text>
  ` : ''}

  <!-- 连接线 + 图钉 -->
  <line x1='${pinCx}' y1='${pinY}' x2='${pinCx}' y2='${pinY + 3}' stroke='${scheme.border}' stroke-width='1.5'/>
  <circle cx='${pinCx}' cy='${pinY + 8}' r='4.5' fill='${scheme.bg}' stroke='${scheme.border}' stroke-width='1.2'/>
  <circle cx='${pinCx}' cy='${pinY + 8}' r='1.8' fill='${scheme.text}'/>
</svg>`.trim();

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}

// 辅助函数: 更新订单的图标
function updateOrderIcon(marker: any, order: any, assignments: any[], drivers: any[], orderETA?: any, isUnassigned: boolean = false) {
  // 查这个订单分配给哪位司机
  const asg = assignments.find(a => a.order_id === order.id);
  const driverName = asg ? drivers.find(d => d.id === asg.driver_id)?.name : undefined;

  const iconUrl = createOrderIconWithLabel(order, orderETA, isUnassigned, driverName);

  // 和 createOrderIconWithLabel 保持一致的尺寸计算
  const typeNames: Record<string, string> = { delivery: '送', pickup: '收', swap: '换', material: '料' };
  const typeName = typeNames[order.type] || order.type;
  const binEmojis: Record<string, string> = { garbage: '🗑', brick: '🧱', soil: '🪨', cement: '🏗', asphalt: '🛣' };
  const binEmoji = binEmojis[order.bin_type] || '';
  const binSize = order.bin_size ? `${order.bin_size}yd` : '';
  const timeDisplay = order.time_window_custom || order.time_window || '';
  const prefix = isUnassigned ? '⇢ ' : '';
  const mainText = prefix + (binEmoji ? binEmoji + ' ' : '') + [typeName, binSize, timeDisplay].filter(Boolean).join(' · ');

  const extractAddr = (addr: string) => {
    if (!addr) return '';
    const parts = addr.split(',').map(p => p.trim());
    if (parts.length < 2) return parts[0] || '';
    return `${parts[0]}, ${parts[1].split(/\s+/)[0]}`;
  };
  const addrText = extractAddr(order.address);
  const hasHinoFlag = /\bhino\b/i.test(order.customer_notes || '');
  const hasETA = !!(orderETA && orderETA.status === 'OK');
  const driverShort = driverName
    ? (driverName.length > 6 ? driverName.slice(0, 6) : driverName)
    : '';

  const charW = (s: string) => s.split('').reduce((w, c) => w + (/[\u4e00-\u9fa5🗑🧱🪨🏗🛣]/.test(c) ? 13 : 6.5), 0);
  const driverW = driverShort ? charW('👤 ' + driverShort) + 10 : 0;
  const badgeWidth = Math.min(Math.max(Math.max(charW(mainText), charW(addrText), driverW) + 12, 60), 170);
  const width = badgeWidth + (hasETA ? 42 : 6);
  // 高度 = (司机条 12+1) + 主行 20 + 地址行 14 + HINO 13 + 图钉 12
  const height = (driverShort ? 13 : 0) + 20 + (addrText ? 15 : 0) + (hasHinoFlag ? 14 : 0) + 12;

  marker.setIcon({
    url: iconUrl,
    scaledSize: new (window as any).google.maps.Size(width, height),
    anchor: new (window as any).google.maps.Point((badgeWidth / 2) + 3, height),
  });
}

// 辅助函数: 创建手动地点图标
function createManualLocationIcon(location: any): string {
  // 根据地点类型选择颜色
  const colorSchemes: Record<string, { bg: string; text: string; border: string; icon: string }> = {
    'depot': { bg: '#607D8B', text: '#FFFFFF', border: '#455A64', icon: '🏢' },           // 灰色 - 仓库
    'transfer_station': { bg: '#4CAF50', text: '#FFFFFF', border: '#388E3C', icon: '♻' }, // 绿色 - 转运站
    'dump_site': { bg: '#4CAF50', text: '#FFFFFF', border: '#388E3C', icon: '♻' },       // 绿色 - 倾倒点
    'material_site': { bg: '#4CAF50', text: '#FFFFFF', border: '#388E3C', icon: '♻' },   // 绿色 - 物料站
    'brick_yard': { bg: '#2E7D32', text: '#FFFFFF', border: '#1B5E20', icon: '🟢' },     // 深绿 - 砖场地
    'brick_factory': { bg: '#1565C0', text: '#FFFFFF', border: '#0D47A1', icon: '🏭' },  // 蓝色 - 砖厂
  };
  
  const scheme = colorSchemes[location.type] || { bg: '#9E9E9E', text: '#FFFFFF', border: '#757575', icon: '📍' };
  
  // SVG图标 - 恢复到原来的尺寸
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'>
      <circle cx='30' cy='25' r='20' fill='${scheme.bg}' stroke='${scheme.border}' stroke-width='2' opacity='0.95'/>
      <text x='30' y='32' text-anchor='middle' font-size='18'>${scheme.icon}</text>
      <rect x='5' y='48' width='50' height='10' rx='2' fill='${scheme.bg}' stroke='${scheme.border}' stroke-width='1' opacity='0.9'/>
      <text x='30' y='56' text-anchor='middle' font-size='8' font-weight='bold' fill='${scheme.text}' font-family='Arial'>${location.shortName}</text>
      <line x1='30' y1='45' x2='30' y2='48' stroke='${scheme.border}' stroke-width='2'/>
    </svg>
  `.trim();
  
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// 辅助函数: 创建序号图标
function createNumberIcon(number: number, color: string): string {
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>
      <circle cx='12' cy='12' r='11' fill='${color}' stroke='white' stroke-width='2' opacity='0.9'/>
      <text x='12' y='17' text-anchor='middle' font-size='12' font-weight='bold' fill='white' font-family='Arial, sans-serif'>${number}</text>
    </svg>
  `.trim();
  
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
