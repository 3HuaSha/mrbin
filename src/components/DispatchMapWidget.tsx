import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSamsaraVehicles } from "@/lib/samsara-api";
import { supabase } from "@/integrations/supabase/client";

const KENNEDY_DEPOT = { lat: 43.7568, lng: -79.2865, label: "Kennedy Depot" };

export function DispatchMapWidget({ drivers, orders = [], assignments = [] }: { drivers: any[], orders?: any[], assignments?: any[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const infoWindowRef = useRef<any>(null);
  
  const [mapLoaded, setMapLoaded] = useState(false);
  const [samsaraLocs, setSamsaraLocs] = useState<any[]>([]);
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<Set<string>>(new Set());
  
  // 获取车辆分配信息
  const { data: vehicleAssignments = [] } = useQuery({
    queryKey: ["vehicle-assignments-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_vehicle_assignments")
        .select("driver_id, vehicle_id, profiles(name), vehicles(name, samsara_id)");
      if (error) throw error;
      return data || [];
    },
  });
  
  // 提取车辆类型
  const extractVehicleType = (name: string): string => {
    const match = name.match(/^([A-Z]+)#/);
    return match ? match[1] : "OTHER";
  };
  
  // 获取所有唯一的车辆类型
  const vehicleTypes = Array.from(new Set(samsaraLocs.map(truck => extractVehicleType(truck.name || "")))).sort();
  
  // 切换车辆类型筛选
  const toggleVehicleType = (type: string) => {
    const newFilter = new Set(vehicleTypeFilter);
    if (newFilter.has(type)) {
      newFilter.delete(type);
    } else {
      newFilter.add(type);
    }
    setVehicleTypeFilter(newFilter);
  };
  
  // 过滤车辆
  const filteredVehicles = vehicleTypeFilter.size === 0 
    ? samsaraLocs 
    : samsaraLocs.filter(truck => vehicleTypeFilter.has(extractVehicleType(truck.name || "")));

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
  }, [mapLoaded]);

  // 3. 通过辅助函数获取 Samsara 数据
  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      const result = await fetchSamsaraVehicles();
      if (active && result.success && result.data) {
        setSamsaraLocs(result.data);
        console.log(`✅ 获取到 ${result.data.length} 辆 Samsara 车辆`);
      } else if (result.error) {
        console.warn("Samsara 获取失败:", result.error);
      }
    };
    
    fetchData();
    const id = setInterval(fetchData, 10000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // 4. 绘制地图标记 (车辆 & 订单)
  useEffect(() => {
    if (!mapInstance.current || !(window as any).google) return;
    
    const newMarkers: Record<string, any> = {};

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
      
      // 调试日志
      if (assignment) {
        console.log(`✅ 车辆匹配成功: ${name} -> ${driverName}`, {
          truckId: truck.id,
          vehicleSamsaraId: assignment.vehicles?.samsara_id,
          vehicleName: assignment.vehicles?.name
        });
      } else {
        console.log(`❌ 车辆未匹配: ${name}`, {
          truckId: truck.id,
          availableAssignments: vehicleAssignments.map((a: any) => ({
            vehicleName: a.vehicles?.name,
            samsaraId: a.vehicles?.samsara_id,
            driverName: a.profiles?.name
          }))
        });
      }
      
      // 创建标签文本：车辆类型 + 驾驶员
      const labelText = driverName ? `${vehicleType} ${driverName}` : vehicleType;
      
      // 创建自定义车辆图标
      const iconUrl = createVehicleIcon(vehicleType);

      const marker = markersRef.current[id] || new (window as any).google.maps.Marker({
        map: mapInstance.current,
        icon: {
            url: iconUrl,
            scaledSize: new (window as any).google.maps.Size(32, 32)
        },
        label: {
          text: labelText,
          color: '#000',
          fontSize: '11px',
          fontWeight: 'bold',
          className: 'vehicle-label'
        },
        zIndex: 1000
      });

      marker.setPosition({ lat, lng });
      
      // 更新标签（如果司机分配改变）
      if (marker.getLabel()?.text !== labelText) {
        marker.setLabel({
          text: labelText,
          color: '#000',
          fontSize: '11px',
          fontWeight: 'bold',
          className: 'vehicle-label'
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
                <strong>类型:</strong> ${vehicleType}
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
      if (order.status === 'done' || order.completed) return; // 隐藏已完成

      const id = "order_" + order.id;
      
      // 已有 marker
      if (markersRef.current[id]) {
        const marker = markersRef.current[id];
        if (marker !== "pending") {
           updateOrderIcon(marker, order, assignments, drivers);
        }
        newMarkers[id] = marker;
        return;
      }

      // 如果没有 marker，需要解析地址并创建
      if (order.address && !newMarkers[id]) {
        newMarkers[id] = "pending"; // 占位
        
        console.log(`🔍 正在解析订单地址: ${order.order_number} - ${order.address}`);
        
        geocoder.geocode({ address: order.address + ", Toronto, ON, Canada" }, (results: any, status: any) => {
          console.log(`📍 地址解析结果: ${order.order_number} - Status: ${status}`, results);
          
          if (status === "OK" && results?.[0]) {
            const pos = results[0].geometry.location;
            
            const marker = new (window as any).google.maps.Marker({
              map: mapInstance.current,
              position: pos,
              title: order.order_number || order.id,
              zIndex: 500,
            });
            
            updateOrderIcon(marker, order, assignments, drivers);
            
            marker.addListener('click', () => {
              if (!infoWindowRef.current) return;
              const driverName = assignments.find(a => a.order_id === order.id)?.driver_id 
                ? drivers.find(d => d.id === assignments.find(a => a.order_id === order.id)?.driver_id)?.name 
                : "未分配";
                
              infoWindowRef.current.setContent(`
                <div style="padding:8px;font-size:12px;color:black;min-width:180px;">
                  <div style="font-weight:bold;font-size:14px;margin-bottom:6px;color:#333;">${order.order_number || order.id}</div>
                  <div style="margin-bottom:4px;">
                    <span style="font-weight:bold;color:#666;">类型:</span> 
                    <span style="color:#2196F3;margin-left:4px;">${order.type}</span>
                  </div>
                  <div style="margin-bottom:4px;">
                    <span style="font-weight:bold;color:#666;">尺寸:</span> 
                    <span style="color:#4CAF50;margin-left:4px;">${order.bin_size || '—'}</span>
                  </div>
                  <div style="margin-bottom:4px;">
                    <span style="font-weight:bold;color:#666;">时段:</span> 
                    <span style="color:#9C27B0;margin-left:4px;">${order.time_window || '—'}</span>
                  </div>
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
            console.log(`✅ 订单标记已创建: ${order.order_number}`);
          } else {
            console.warn(`❌ 地址解析失败: ${order.order_number} - ${order.address} - Status: ${status}`);
          }
        });
      }
    });

    // 清理不再显示的 markers
    Object.keys(markersRef.current).forEach(key => {
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

  }, [orders, assignments, filteredVehicles, drivers, mapLoaded, vehicleAssignments]);

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
      {/* 车辆类型筛选器 */}
      {vehicleTypes.length > 0 && (
        <div className="absolute top-2 left-2 z-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-2 flex flex-wrap gap-1 max-w-md">
          <div className="text-xs font-semibold text-gray-700 w-full mb-1">车辆筛选:</div>
          {vehicleTypes.map(type => (
            <button
              key={type}
              onClick={() => toggleVehicleType(type)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                vehicleTypeFilter.has(type) || vehicleTypeFilter.size === 0
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {type} ({samsaraLocs.filter(v => extractVehicleType(v.name || "") === type).length})
            </button>
          ))}
          {vehicleTypeFilter.size > 0 && (
            <button
              onClick={() => setVehicleTypeFilter(new Set())}
              className="px-2 py-1 text-xs rounded bg-red-500 text-white"
            >
              清除筛选
            </button>
          )}
        </div>
      )}
      <div id="map" ref={mapRef} className="w-full h-full bg-muted/10 min-h-[300px]"></div>
    </div>
  );
}

// 辅助函数: 创建车辆图标
function createVehicleIcon(vehicleType: string): string {
  const colors: Record<string, string> = {
    'BIN': '#4CAF50',    // 绿色
    'FLAT': '#2196F3',   // 蓝色
    'DUMP': '#9C27B0',   // 紫色
    'PROALL': '#FF9800', // 橙色
    'HINO': '#F44336',   // 红色
    'MACK': '#607D8B',   // 灰色
    'TRUCK': '#795548'   // 棕色
  };
  
  const color = colors[vehicleType] || '#795548';
  const fill = encodeURIComponent(color);
  
  // 创建卡车图标SVG
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect x='4' y='12' width='24' height='12' rx='2' fill='%23${fill.slice(1)}' stroke='%23000' stroke-width='1'/%3E%3Ccircle cx='10' cy='24' r='3' fill='%23222'/%3E%3Ccircle cx='22' cy='24' r='3' fill='%23222'/%3E%3Crect x='6' y='6' width='20' height='6' rx='1' fill='%23${fill.slice(1)}' stroke='%23000' stroke-width='1'/%3E%3Ctext x='16' y='10' text-anchor='middle' font-size='6' font-weight='bold' fill='white'%3E${vehicleType}%3C/text%3E%3C/svg%3E`;
}

// 辅助函数: 更新订单的图标颜色
function updateOrderIcon(marker: any, order: any, assignments: any[], drivers: any[]) {
  const typeColors: any = {
    'delivery': '#2196F3',
    'pickup': '#4CAF50',
    'swap': '#9C27B0'
  };
  const baseColor = typeColors[order.type] || '#ffca28';
  
  const assigned = assignments.find(a => a.order_id === order.id);
  const stroke = assigned ? 'fff' : '333'; 

  const fill = encodeURIComponent(baseColor);
  const svg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='30' viewBox='0 0 24 30'%3E%3Cellipse cx='12' cy='12' rx='10' ry='10' fill='${fill}' stroke='%23${stroke}' stroke-width='2'/%3E%3Cpath d='M12 22 L12 30' stroke='%23${stroke}' stroke-width='2'/%3E%3C/svg%3E`;
  
  marker.setIcon({
    url: svg,
    scaledSize: new (window as any).google.maps.Size(24, 30),
    anchor: new (window as any).google.maps.Point(12, 30),
  });
}
