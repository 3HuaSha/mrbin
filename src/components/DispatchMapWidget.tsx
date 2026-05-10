import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSamsaraVehicles } from "@/lib/samsara-api";
import { supabase } from "@/integrations/supabase/client";
import { MANUAL_STEP_LOCATIONS, LOCATION_TYPE_NAMES } from "@/lib/manual-step-locations";

const KENNEDY_DEPOT = { lat: 43.7568, lng: -79.2865, label: "Kennedy Depot" };

export function DispatchMapWidget({ drivers, orders = [], assignments = [], driverETAs = {}, businessType = 'garbage' }: { 
  drivers: any[], 
  orders?: any[], 
  assignments?: any[],
  driverETAs?: Record<string, any>,
  businessType?: 'garbage' | 'brick'
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const infoWindowRef = useRef<any>(null);
  const routeLinesRef = useRef<any[]>([]); // 存储路线折线
  
  const [mapLoaded, setMapLoaded] = useState(false);
  const [samsaraLocs, setSamsaraLocs] = useState<any[]>([]);
  
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

    // 渲染基地的点
    new (window as any).google.maps.Marker({
      position: KENNEDY_DEPOT,
      map: mapInstance.current,
      icon: {
        url: 'http://maps.google.com/mapfiles/kml/pal2/icon2.png',
        scaledSize: new (window as any).google.maps.Size(24, 24)
      },
      title: "Kennedy Depot"
    });
    
    // 渲染所有手动步骤固定地点
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
        zIndex: 50
      });
      
      // 将固定地点标记也存储到markersRef中，用于路线绘制
      const markerId = `manual_${location.id}`;
      markersRef.current[markerId] = marker;
      
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

  // 3. 通过辅助函数获取 Samsara 数据
  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        const result = await fetchSamsaraVehicles();
        if (active && result.success && result.data) {
          setSamsaraLocs(result.data);
        } else if (result.error) {
          console.warn("Samsara获取失败:", result.error);
          console.warn("📍 地图将继续显示订单，但不显示车辆位置");
        }
      } catch (error) {
        console.error("❌ Samsara API 调用异常:", error);
        console.warn("📍 地图将继续显示订单，但不显示车辆位置");
      }
    };
    
    fetchData();
    const id = setInterval(fetchData, 30000); // 改为30秒刷新一次，减少API调用
    return () => { active = false; clearInterval(id); };
  }, []);

  // 4. 绘制地图标记 (车辆 & 订单)
  useEffect(() => {
    if (!mapInstance.current || !(window as any).google) return;
    
    console.log('🗺️ 开始绘制地图标记, businessType:', businessType, 'filteredVehicles:', filteredVehicles.length);
    
    const newMarkers: Record<string, any> = {};

    // 首先清除所有车辆标记（truck_ 开头的）
    Object.keys(markersRef.current).forEach(key => {
      if (key.startsWith('truck_') && markersRef.current[key] && markersRef.current[key] !== "pending") {
        markersRef.current[key].setMap(null);
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
    
    orders.forEach(order => {
      if (order.status === 'done' || order.completed) {
        return; // 隐藏已完成
      }

      const id = "order_" + order.id;
      
      // 查找该订单的ETA信息
      let orderETA = null;
      for (const driverId in driverETAs) {
        const eta = driverETAs[driverId];
        const found = eta?.orders?.find((o: any) => o.orderId === order.id);
        if (found) {
          orderETA = found;
          break;
        }
      }
      
      // 已有 marker
      if (markersRef.current[id]) {
        const marker = markersRef.current[id];
        if (marker !== "pending") {
           updateOrderIcon(marker, order, assignments, drivers, orderETA);
        }
        newMarkers[id] = marker;
        return;
      }

      // 如果没有 marker，需要解析地址并创建
      if (order.address && !newMarkers[id]) {
        newMarkers[id] = "pending"; // 占位
        
        geocoder.geocode({ address: order.address + ", Toronto, ON, Canada" }, (results: any, status: any) => {
          if (status === "OK" && results?.[0]) {
            const pos = results[0].geometry.location;
            
            const marker = new (window as any).google.maps.Marker({
              map: mapInstance.current,
              position: pos,
              title: order.order_number || order.id,
              zIndex: 500,
            });
            
            updateOrderIcon(marker, order, assignments, drivers, orderETA);
            
            marker.addListener('click', () => {
              if (!infoWindowRef.current) return;
              const driverName = assignments.find(a => a.order_id === order.id)?.driver_id 
                ? drivers.find(d => d.id === assignments.find(a => a.order_id === order.id)?.driver_id)?.name 
                : "未分配";
              
              // 显示自定义时段或默认时段
              const timeDisplay = order.time_window_custom || order.time_window || '—';
              
              // 桶类型中文映射
              const binTypeNames: Record<string, string> = {
                'garbage': '垃圾桶',
                'brick': '砖桶',
                'soil': '土桶',
                'cement': '水泥桶',
                'asphalt': '沥青桶'
              };
              const binTypeName = binTypeNames[order.bin_type] || '—';
              
              // ETA信息
              const etaInfo = orderETA && orderETA.status === 'OK' 
                ? `<div style="margin-bottom:4px;">
                     <span style="font-weight:bold;color:#666;">预计到达:</span> 
                     <span style="color:#2196F3;margin-left:4px;">${new Date(orderETA.eta).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                   </div>`
                : '';
                
              infoWindowRef.current.setContent(`
                <div style="padding:8px;font-size:12px;color:black;min-width:180px;">
                  <div style="font-weight:bold;font-size:14px;margin-bottom:6px;color:#333;">${order.order_number || order.id}</div>
                  <div style="margin-bottom:4px;">
                    <span style="font-weight:bold;color:#666;">类型:</span> 
                    <span style="color:#2196F3;margin-left:4px;">${order.type}</span>
                  </div>
                  <div style="margin-bottom:4px;">
                    <span style="font-weight:bold;color:#666;">桶类型:</span> 
                    <span style="color:#FF5722;margin-left:4px;">${binTypeName}</span>
                  </div>
                  <div style="margin-bottom:4px;">
                    <span style="font-weight:bold;color:#666;">尺寸:</span> 
                    <span style="color:#4CAF50;margin-left:4px;">${order.bin_size || '—'}</span>
                  </div>
                  <div style="margin-bottom:4px;">
                    <span style="font-weight:bold;color:#666;">时段:</span> 
                    <span style="color:#9C27B0;margin-left:4px;">${timeDisplay}</span>
                  </div>
                  ${etaInfo}
                  <div style="margin-bottom:6px;">
                    <span style="font-weight:bold;color:#666;">地址:</span> 
                    <div style="color:#333;margin-top:2px;font-size:11px;">${order.address}</div>
                  </div>
                  <div style="margin-bottom:4px;">
                    <span style="font-weight:bold;color:#666;">驾驶员:</span> 
                    <span style="color:#FF9800;margin-left:4px;">${driverName}</span>
                  </div>
                </div>
              `);
              infoWindowRef.current.open(mapInstance.current, marker);
            });
            
            markersRef.current[id] = marker;
          } else {
            console.warn(`地址解析失败: ${order.order_number} - ${order.address}`);
          }
        });
      }
    });

    // 清理不再显示的 markers（但保留固定地点标记）
    Object.keys(markersRef.current).forEach(key => {
      // 跳过固定地点标记（以manual_开头）
      if (key.startsWith('manual_')) return;
      
      if (markersRef.current[key] && markersRef.current[key] !== "pending" && !newMarkers[key]) {
        markersRef.current[key].setMap(null);
      }
    });
    
    // 更新
    Object.keys(newMarkers).forEach(key => {
      if (newMarkers[key] !== "pending") {
        markersRef.current[key] = newMarkers[key];
      }
    });

  }, [orders, assignments, filteredVehicles, drivers, mapLoaded, vehicleAssignments, driverETAs, businessType]);

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

// 辅助函数: 创建订单标记 (单行窄徽章, 紧凑清爽)
function createOrderIconWithLabel(order: any, orderETA?: any): string {
  // 订单类型配色
  const colorSchemes: Record<string, { bg: string; text: string; border: string }> = {
    'delivery': { bg: '#2196F3', text: '#FFFFFF', border: '#0D47A1' },  // 蓝
    'pickup':   { bg: '#4CAF50', text: '#FFFFFF', border: '#1B5E20' },  // 绿
    'swap':     { bg: '#9C27B0', text: '#FFFFFF', border: '#4A148C' },  // 紫
  };
  const scheme = colorSchemes[order.type] || { bg: '#FF9800', text: '#FFFFFF', border: '#E65100' };

  const typeNames: Record<string, string> = {
    delivery: '送', pickup: '收', swap: '换', material: '料',
  };
  const typeName = typeNames[order.type] || order.type;

  const binTypeEmojis: Record<string, string> = {
    garbage: '🗑', brick: '🧱', soil: '🪨', cement: '🏗', asphalt: '🛣',
  };
  const binEmoji = binTypeEmojis[order.bin_type] || '';

  const binSize = order.bin_size ? `${order.bin_size}yd` : '';
  const timeDisplay = order.time_window_custom || order.time_window || '';

  // 主徽章文本: 类型 + 尺寸 + 时段, 单行
  // 例: "送 20yd · 14:00" / "换 30yd · AM"
  const parts = [typeName, binSize, timeDisplay].filter(Boolean);
  const mainText = parts.join(' · ');

  // ETA 右上角小徽章
  let etaText = '';
  if (orderETA && orderETA.status === 'OK') {
    etaText = new Date(orderETA.eta).toLocaleTimeString('zh-CN', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  // 宽度按文本动态计算 (中文字符按 14 计, 英数按 7 计)
  const mainCharWidth = mainText.split('').reduce((w, c) => w + (/[\u4e00-\u9fa5🗑🧱🪨🏗🛣]/.test(c) ? 14 : 7), 0);
  const badgeWidth = Math.max(mainCharWidth + 18, 80);
  const svgWidth = badgeWidth + (etaText ? 46 : 6);
  const svgHeight = 38; // 徽章 22 + 间距 2 + 图钉 14

  const badgeX = 3;
  const badgeY = 0;
  const badgeH = 22;
  const pinCx = badgeX + badgeWidth / 2;

  const svg = `
<svg xmlns='http://www.w3.org/2000/svg' width='${svgWidth}' height='${svgHeight}' viewBox='0 0 ${svgWidth} ${svgHeight}'>
  <defs>
    <filter id='s' x='-20%' y='-20%' width='140%' height='140%'>
      <feDropShadow dx='0' dy='1' stdDeviation='1.5' flood-opacity='0.35'/>
    </filter>
  </defs>
  <!-- 主徽章 -->
  <rect x='${badgeX}' y='${badgeY}' width='${badgeWidth}' height='${badgeH}' rx='11'
        fill='${scheme.bg}' stroke='${scheme.border}' stroke-width='1.5' filter='url(#s)'/>
  <text x='${badgeX + badgeWidth / 2}' y='${badgeY + 15}' text-anchor='middle'
        font-size='12' font-weight='bold' fill='${scheme.text}'
        font-family='-apple-system, "Segoe UI", Roboto, Arial, sans-serif'>${escapeXml(binEmoji + (binEmoji ? ' ' : '') + mainText)}</text>

  ${etaText ? `
  <!-- ETA 小徽章 -->
  <rect x='${badgeX + badgeWidth + 4}' y='${badgeY + 2}' width='38' height='18' rx='9'
        fill='#FFD54F' stroke='#F57F17' stroke-width='1' filter='url(#s)'/>
  <text x='${badgeX + badgeWidth + 23}' y='${badgeY + 15}' text-anchor='middle'
        font-size='10' font-weight='bold' fill='#333'
        font-family='-apple-system, "Segoe UI", Roboto, Arial, sans-serif'>${etaText}</text>
  ` : ''}

  <!-- 连接线 + 图钉 -->
  <line x1='${pinCx}' y1='${badgeH}' x2='${pinCx}' y2='${badgeH + 4}' stroke='${scheme.border}' stroke-width='2'/>
  <circle cx='${pinCx}' cy='${badgeH + 9}' r='5' fill='${scheme.bg}' stroke='${scheme.border}' stroke-width='1.5'/>
  <circle cx='${pinCx}' cy='${badgeH + 9}' r='2' fill='${scheme.text}'/>
</svg>`.trim();

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}

// 辅助函数: 更新订单的图标 (单行窄徽章)
function updateOrderIcon(marker: any, order: any, assignments: any[], drivers: any[], orderETA?: any) {
  const iconUrl = createOrderIconWithLabel(order, orderETA);

  // 跟 createOrderIconWithLabel 保持一致的尺寸计算
  const typeNames: Record<string, string> = { delivery: '送', pickup: '收', swap: '换', material: '料' };
  const typeName = typeNames[order.type] || order.type;
  const binTypeEmojis: Record<string, string> = { garbage: '🗑', brick: '🧱', soil: '🪨', cement: '🏗', asphalt: '🛣' };
  const binEmoji = binTypeEmojis[order.bin_type] || '';
  const binSize = order.bin_size ? `${order.bin_size}yd` : '';
  const timeDisplay = order.time_window_custom || order.time_window || '';
  const parts = [typeName, binSize, timeDisplay].filter(Boolean);
  const mainText = (binEmoji ? binEmoji + ' ' : '') + parts.join(' · ');

  const mainCharWidth = mainText.split('').reduce((w, c) => w + (/[\u4e00-\u9fa5🗑🧱🪨🏗🛣]/.test(c) ? 14 : 7), 0);
  const badgeWidth = Math.max(mainCharWidth + 18, 80);
  const hasETA = !!(orderETA && orderETA.status === 'OK');
  const width = badgeWidth + (hasETA ? 46 : 6);
  const height = 38;

  marker.setIcon({
    url: iconUrl,
    scaledSize: new (window as any).google.maps.Size(width, height),
    anchor: new (window as any).google.maps.Point((badgeWidth / 2) + 3, height),
  });
}

// 辅助函数: 创建手动地点图标
function createManualLocationIcon(location: any): string {
  // 根据地点类型选择颜色 - 仓库和垃圾场统一图标
  const colorSchemes: Record<string, { bg: string; text: string; border: string; icon: string }> = {
    'depot': { bg: '#607D8B', text: '#FFFFFF', border: '#455A64', icon: '🏢' },           // 灰色 - 仓库
    'transfer_station': { bg: '#4CAF50', text: '#FFFFFF', border: '#388E3C', icon: '♻' }, // 绿色 - 转运站
    'dump_site': { bg: '#4CAF50', text: '#FFFFFF', border: '#388E3C', icon: '♻' },       // 绿色 - 倾倒点（统一为垃圾场）
    'material_site': { bg: '#4CAF50', text: '#FFFFFF', border: '#388E3C', icon: '♻' }    // 绿色 - 物料站（统一为垃圾场）
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
