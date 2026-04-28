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
  
  // 获取车辆分配信息
  const { data: vehicleAssignments = [] } = useQuery({
    queryKey: ["vehicle-assignments-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_vehicle_assignments")
        .select("driver_id, vehicle_id, profiles(name), vehicles(name)");
      if (error) throw error;
      return data || [];
    },
  });

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
    samsaraLocs.forEach(truck => {
      const name = truck.name || "";
      if (!name) return;
      
      const id = "truck_" + truck.id;
      const lat = truck.location?.latitude;
      const lng = truck.location?.longitude;
      if (!lat || !lng) return;

      // 提取车辆类型（从名称中提取，如 BIN#1 -> BIN, FLAT#1 -> FLAT）
      const extractVehicleType = (name: string): string => {
        const match = name.match(/^([A-Z]+)#/);
        return match ? match[1] : "TRUCK";
      };
      
      const vehicleType = extractVehicleType(name);
      
      // 创建自定义车辆图标
      const iconUrl = createVehicleIcon(vehicleType);

      const marker = markersRef.current[id] || new (window as any).google.maps.Marker({
        map: mapInstance.current,
        icon: {
            url: iconUrl,
            scaledSize: new (window as any).google.maps.Size(32, 32)
        },
        zIndex: 1000
      });

      marker.setPosition({ lat, lng });
      newMarkers[id] = marker;
      
      // 添加点击事件显示车辆信息
      marker.addListener('click', () => {
        if (!infoWindowRef.current) return;
        
        // 查找分配给该车辆的司机
        const assignment = vehicleAssignments.find((a: any) => {
          // 这里需要根据车辆名称匹配
          // 由于Samsara返回的车辆ID可能不同，我们暂时使用名称匹配
          const vehicleName = a.vehicles?.name || "";
          return vehicleName.includes(name) || name.includes(vehicleName);
        });
        
        const driverName = assignment ? 
          (assignment.profiles?.name || "已分配") : 
          "未分配";
          
        infoWindowRef.current.setContent(`
          <div style="padding:8px;font-size:12px;color:black;min-width:150px;">
            <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">${name}</div>
            <div style="color:#666;margin-bottom:4px;">
              <strong>类型:</strong> ${vehicleType}
            </div>
            <div style="color:#666;margin-bottom:4px;">
              <strong>驾驶员:</strong> ${driverName}
            </div>
            <div style="color:#666;">
              <strong>位置:</strong> ${lat.toFixed(6)}, ${lng.toFixed(6)}
            </div>
          </div>
        `);
        infoWindowRef.current.open(mapInstance.current, marker);
      });
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
        geocoder.geocode({ address: order.address + ", ON, Canada" }, (results: any, status: any) => {
          if (status === "OK" && results?.[0]) {
            const pos = results[0].geometry.location;
            
            const shortAddr = (order.address || "").split(',').slice(0, 2).join(',').trim();
            const labelText = order.type !== 'dump' ? `${order.labelTime || 'ASAP'} ${order.bin_size || order.binSize || ''} ${shortAddr}` : '';

            const marker = new (window as any).google.maps.Marker({
              map: mapInstance.current,
              position: pos,
              title: order.id,
              zIndex: 500,
              label: labelText ? { text: labelText, className: "map-label" } : null,
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
                    <span style="color:#2196F3;margin-left:4px;">${order.typeText || order.type}</span>
                  </div>
                  <div style="margin-bottom:4px;">
                    <span style="font-weight:bold;color:#666;">尺寸:</span> 
                    <span style="color:#4CAF50;margin-left:4px;">${order.bin_size || order.binSize || '—'}</span>
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

  }, [orders, assignments, samsaraLocs, drivers, mapLoaded, vehicleAssignments]);

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
