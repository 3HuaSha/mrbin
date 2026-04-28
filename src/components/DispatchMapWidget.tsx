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
  
  // 获取车辆分配信息（包含车辆的 type 字段）
  const { data: vehicleAssignments = [] } = useQuery({
    queryKey: ["vehicle-assignments-map"],
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
      console.log("✅ 获取到车辆分配:", data);
      return data || [];
    },
  });
  
  // 调试：打印车辆分配数据
  useEffect(() => {
    if (vehicleAssignments.length > 0) {
      console.log("📋 车辆分配数据详情:", vehicleAssignments.map((a: any) => ({
        driverName: a.profiles?.name,
        vehicleName: a.vehicles?.name,
        samsaraId: a.vehicles?.samsara_id
      })));
    }
  }, [vehicleAssignments]);
  
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
      // 使用车辆的 type 字段（HINO 或 MACK），如果没有则使用提取的类型
      const vehicleTypeName = assignment?.vehicles?.type || vehicleType;
      
      // 调试日志
      if (assignment) {
        console.log(`✅ 车辆匹配成功: ${name} -> ${driverName} (${vehicleTypeName})`, {
          truckId: truck.id,
          vehicleSamsaraId: assignment.vehicles?.samsara_id,
          vehicleName: assignment.vehicles?.name,
          vehicleType: assignment.vehicles?.type
        });
      } else {
        console.log(`❌ 车辆未匹配: ${name}`, {
          truckId: truck.id,
          availableAssignments: vehicleAssignments.map((a: any) => ({
            vehicleName: a.vehicles?.name,
            samsaraId: a.vehicles?.samsara_id,
            driverName: a.profiles?.name,
            vehicleType: a.vehicles?.type
          }))
        });
      }
      
      // 创建标签文本：使用车辆 type (HINO/MACK) + 驾驶员
      const labelText = driverName ? `${vehicleTypeName} ${driverName}` : vehicleTypeName;
      
      // 创建自定义车辆图标（带标签）- 传入 vehicleTypeName 而不是 vehicleType
      const iconUrl = createVehicleIconWithLabel(vehicleTypeName, driverName);

      const marker = markersRef.current[id] || new (window as any).google.maps.Marker({
        map: mapInstance.current,
        icon: {
            url: iconUrl,
            scaledSize: new (window as any).google.maps.Size(90, 55),
            anchor: new (window as any).google.maps.Point(45, 50) // 锚点在底部中心
        },
        zIndex: 1000
      });

      marker.setPosition({ lat, lng });
      
      // 更新图标（如果司机分配改变）
      const newIconUrl = createVehicleIconWithLabel(vehicleTypeName, driverName);
      if (marker.getIcon()?.url !== newIconUrl) {
        marker.setIcon({
          url: newIconUrl,
          scaledSize: new (window as any).google.maps.Size(90, 55),
          anchor: new (window as any).google.maps.Point(45, 50)
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
    
    console.log(`📦 开始绘制订单，共 ${orders.length} 个订单`);
    
    orders.forEach(order => {
      console.log(`📦 处理订单: ${order.order_number || order.id}`, {
        status: order.status,
        completed: order.completed,
        address: order.address,
        type: order.type,
        bin_size: order.bin_size,
        time_window: order.time_window
      });
      
      if (order.status === 'done' || order.completed) {
        console.log(`⏭️ 跳过已完成订单: ${order.order_number}`);
        return; // 隐藏已完成
      }

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
  const labelText = driverName ? `${vehicleType} ${driverName}` : vehicleType;
  
  // 估算文本宽度（每个字符约7像素，中文字符约11像素）
  const textWidth = labelText.split('').reduce((width, char) => {
    return width + (/[\u4e00-\u9fa5]/.test(char) ? 11 : 7);
  }, 0);
  const cardWidth = Math.max(textWidth + 12, 50);
  const svgWidth = Math.max(cardWidth + 8, 90);
  
  // SVG 总高度：标签卡片(18) + 间距(2) + 卡车图标(24) = 44，缩小整体尺寸
  const svgHeight = 55;
  const cardX = (svgWidth - cardWidth) / 2;
  const truckX = (svgWidth - 24) / 2;
  
  // 创建SVG，包含顶部标签卡片和底部卡车图标
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='${svgWidth}' height='${svgHeight}' viewBox='0 0 ${svgWidth} ${svgHeight}'>
      <!-- 顶部标签卡片 - 有色背景 + 对比色文字 -->
      <rect x='${cardX}' y='0' width='${cardWidth}' height='18' rx='3' fill='${scheme.bg}' stroke='#333' stroke-width='1' opacity='0.95'/>
      <text x='${svgWidth/2}' y='12' text-anchor='middle' font-size='10' font-weight='bold' fill='${scheme.text}' font-family='Arial, sans-serif'>${labelText}</text>
      
      <!-- 连接线 - 缩短距离 -->
      <line x1='${svgWidth/2}' y1='18' x2='${svgWidth/2}' y2='20' stroke='${scheme.bg}' stroke-width='1.5'/>
      
      <!-- 底部卡车图标 - 缩小尺寸 -->
      <g transform='translate(${truckX}, 20)'>
        <!-- 车身 -->
        <rect x='3' y='9' width='18' height='9' rx='1.5' fill='${scheme.truck}' stroke='#000' stroke-width='1.2'/>
        <!-- 车轮 -->
        <circle cx='7.5' cy='18' r='2.2' fill='#222' stroke='#000' stroke-width='0.8'/>
        <circle cx='16.5' cy='18' r='2.2' fill='#222' stroke='#000' stroke-width='0.8'/>
        <!-- 驾驶室 -->
        <rect x='4.5' y='4.5' width='15' height='4.5' rx='0.8' fill='${scheme.truck}' stroke='#000' stroke-width='1.2'/>
        <!-- 车窗 -->
        <rect x='6' y='5.5' width='4.5' height='2.5' rx='0.4' fill='#87CEEB' opacity='0.7'/>
        <rect x='13.5' y='5.5' width='4.5' height='2.5' rx='0.4' fill='#87CEEB' opacity='0.7'/>
      </g>
    </svg>
  `.trim();
  
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// 辅助函数: 创建带标签的订单图标
function createOrderIconWithLabel(order: any): string {
  // 为每种订单类型定义配色方案
  const colorSchemes: Record<string, { bg: string; text: string; pin: string }> = {
    'delivery': { bg: '#2196F3', text: '#FFFFFF', pin: '#2196F3' },  // 蓝色
    'pickup': { bg: '#4CAF50', text: '#FFFFFF', pin: '#4CAF50' },    // 绿色
    'swap': { bg: '#9C27B0', text: '#FFFFFF', pin: '#9C27B0' }       // 紫色
  };
  
  const scheme = colorSchemes[order.type] || { bg: '#FF9800', text: '#FFFFFF', pin: '#FF9800' };
  
  // 订单类型中文映射
  const typeNames: Record<string, string> = {
    'delivery': '送货',
    'pickup': '取货',
    'swap': '换货'
  };
  const typeName = typeNames[order.type] || order.type;
  
  // 提取街道号和城市名
  const extractAddressShort = (addr: string): string => {
    if (!addr) return '';
    
    // 提取街道号（第一个数字部分）
    const streetNumberMatch = addr.match(/^\d+[A-Za-z]?/);
    const streetNumber = streetNumberMatch ? streetNumberMatch[0] : '';
    
    // 提取城市名（逗号后的第一个词，通常是城市）
    const parts = addr.split(',').map(p => p.trim());
    const city = parts.length > 1 ? parts[1].split(' ')[0] : '';
    
    return streetNumber && city ? `${streetNumber}, ${city}` : addr.substring(0, 20);
  };
  
  // 构建标签文本 - 两行：第一行是类型+尺寸+时段，第二行是简化地址
  const line1 = `${typeName} ${order.bin_size || ''} ${order.time_window || ''}`.trim();
  const line2 = extractAddressShort(order.address);
  
  const lines = [line1, line2].filter(line => line);
  
  // 计算卡片尺寸
  const maxLineWidth = Math.max(...lines.map(line => {
    return line.split('').reduce((width, char) => {
      return width + (/[\u4e00-\u9fa5]/.test(char) ? 11 : 7);
    }, 0);
  }));
  
  const cardWidth = Math.max(maxLineWidth + 16, 80);
  const cardHeight = 8 + lines.length * 14; // 顶部padding + 每行14px
  const svgWidth = Math.max(cardWidth + 10, 100);
  const svgHeight = cardHeight + 35;
  
  const cardX = (svgWidth - cardWidth) / 2;
  const pinX = svgWidth / 2;
  
  // 生成文本行 - 使用更大的字体
  let textElements = '';
  lines.forEach((line, index) => {
    const y = 12 + index * 14;
    textElements += `<text x='${svgWidth/2}' y='${y}' text-anchor='middle' font-size='11' font-weight='${index === 0 ? 'bold' : 'normal'}' fill='${scheme.text}' font-family='Arial, sans-serif'>${line}</text>`;
  });
  
  // 创建SVG
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='${svgWidth}' height='${svgHeight}' viewBox='0 0 ${svgWidth} ${svgHeight}'>
      <!-- 顶部信息卡片 -->
      <rect x='${cardX}' y='0' width='${cardWidth}' height='${cardHeight}' rx='3' fill='${scheme.bg}' stroke='#333' stroke-width='1' opacity='0.95'/>
      ${textElements}
      
      <!-- 连接线 -->
      <line x1='${pinX}' y1='${cardHeight}' x2='${pinX}' y2='${cardHeight + 3}' stroke='${scheme.pin}' stroke-width='1.5'/>
      
      <!-- 底部图钉 -->
      <g transform='translate(${pinX - 12}, ${cardHeight + 3})'>
        <circle cx='12' cy='10' r='10' fill='${scheme.pin}' stroke='#333' stroke-width='1.5'/>
        <circle cx='12' cy='10' r='4' fill='white' opacity='0.9'/>
        <line x1='12' y1='20' x2='12' y2='32' stroke='${scheme.pin}' stroke-width='2.5'/>
      </g>
    </svg>
  `.trim();
  
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// 辅助函数: 更新订单的图标
function updateOrderIcon(marker: any, order: any, assignments: any[], drivers: any[]) {
  const iconUrl = createOrderIconWithLabel(order);
  
  // 提取街道号和城市名
  const extractAddressShort = (addr: string): string => {
    if (!addr) return '';
    const streetNumberMatch = addr.match(/^\d+[A-Za-z]?/);
    const streetNumber = streetNumberMatch ? streetNumberMatch[0] : '';
    const parts = addr.split(',').map(p => p.trim());
    const city = parts.length > 1 ? parts[1].split(' ')[0] : '';
    return streetNumber && city ? `${streetNumber}, ${city}` : addr.substring(0, 20);
  };
  
  // 计算图标尺寸 - 和车辆图标相同的缩放
  const line1 = `${order.type} ${order.bin_size || ''} ${order.time_window || ''}`.trim();
  const line2 = extractAddressShort(order.address);
  const lines = [line1, line2].filter(line => line);
  
  const baseHeight = 8 + lines.length * 14 + 35;
  const scaleFactor = 1.0; // 使用1.0倍，和车辆图标一样的大小
  const width = 100 * scaleFactor;
  const height = baseHeight * scaleFactor;
  
  marker.setIcon({
    url: iconUrl,
    scaledSize: new (window as any).google.maps.Size(width, height),
    anchor: new (window as any).google.maps.Point(width / 2, height),
  });
}
