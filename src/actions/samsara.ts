import { createServerFn } from "@tanstack/react-start";

export const fetchSamsaraData = createServerFn({ method: "GET" })
  .handler(async () => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || process.env.SAMSARA_API_KEY || import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;

    try {
      let allUnits: any[] = [];
      let counts = { vehicles: 0, trailers: 0, equipment: 0 };
      
      // 获取所有单位数据
      const endpoints = [
        { key: 'vehicles', url: 'https://api.samsara.com/fleet/vehicles?limit=512', name: 'Vehicles' },
        { key: 'trailers', url: 'https://api.samsara.com/fleet/trailers?limit=512', name: 'Trailers' },
        { key: 'equipment', url: 'https://api.samsara.com/fleet/equipment?limit=512', name: 'Equipment' },
        { key: 'assets', url: 'https://api.samsara.com/assets?limit=512', name: 'Assets (Unified)' },
      ];

      for (const ep of endpoints) {
        let hasNextPage = true;
        let after = '';
        
        while (hasNextPage) {
          const url = `${ep.url}${after ? `&after=${after}` : ''}`;
          
          try {
            const response = await fetch(url, {
              headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
            });
            
            if (!response.ok) {
              console.warn(`⚠️ Samsara API [${ep.name}] 响应异常: ${response.status}`);
              break;
            }
            
            const result = await response.json();
            const data = result.data || [];
            
            allUnits = [...allUnits, ...data];
            
            // 更新统计
            if (ep.key === 'vehicles') counts.vehicles += data.length;
            else if (ep.key === 'trailers') counts.trailers += data.length;
            else counts.equipment += data.length;

            hasNextPage = result.pagination?.hasNextPage || false;
            after = result.pagination?.endCursor || '';
          } catch (err) {
            console.error(`❌ 获取 [${ep.name}] 失败:`, err);
            break;
          }
        }
      }

      // 获取所有位置信息
      let allLocations: any[] = [];
      const locationEndpoints = [
        'https://api.samsara.com/fleet/vehicles/locations?limit=512',
        'https://api.samsara.com/fleet/trailers/locations?limit=512',
        'https://api.samsara.com/fleet/equipment/locations?limit=512',
        'https://api.samsara.com/assets/locations?limit=512'
      ];

      for (const endpoint of locationEndpoints) {
        let hasNextPage = true;
        let after = '';
        while (hasNextPage) {
          const url = `${endpoint}${after ? `&after=${after}` : ''}`;
          const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
          });
          if (!response.ok) break;
          const result = await response.json();
          allLocations = [...allLocations, ...(result.data || [])];
          hasNextPage = result.pagination?.hasNextPage || false;
          after = result.pagination?.endCursor || '';
        }
      }

      // 获取所有司机信息
      let allDrivers: any[] = [];
      try {
        let hasNextPage = true;
        let after = '';
        while (hasNextPage) {
          const url = `https://api.samsara.com/fleet/drivers?limit=512${after ? `&after=${after}` : ''}`;
          const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
          });
          if (!response.ok) break;
          const result = await response.json();
          allDrivers = [...allDrivers, ...(result.data || [])];
          hasNextPage = result.pagination?.hasNextPage || false;
          after = result.pagination?.endCursor || '';
        }
      } catch (err) {
        console.error('❌ 获取司机失败:', err);
      }

      // 获取当前所有司机-车辆分配关系
      let allAssignments: any[] = [];
      try {
        const response = await fetch(`https://api.samsara.com/fleet/driver-vehicle-assignments?startTime=${new Date().toISOString()}`, {
          headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
        });
        if (response.ok) {
          const result = await response.json();
          allAssignments = result.data || [];
        }
      } catch (err) {
        console.error('❌ 获取分配关系失败:', err);
      }

      // 合并数据并去重
      const uniqueUnitsMap = new Map();
      allUnits.forEach(u => {
        if (u && u.id) {
          if (!uniqueUnitsMap.has(u.id) || (!uniqueUnitsMap.get(u.id).name && u.name)) {
            uniqueUnitsMap.set(u.id, u);
          }
        }
      });

      const locationMap = new Map();
      allLocations.forEach(loc => {
        if (loc && loc.id) {
          locationMap.set(loc.id, loc);
        }
      });

      const mergedData = Array.from(uniqueUnitsMap.values()).map(v => {
        const locInfo = locationMap.get(v.id);
        const name = v.name || v.trailerName || v.machineName || v.externalIds?.vin || `Unit-${v.id.substring(0, 5)}`;
        return {
          id: v.id,
          name: name,
          location: locInfo?.location || null,
          time: locInfo?.time || null
        };
      });

      console.log(`✅ 同步完成: Vehicles(${counts.vehicles}), Trailers(${counts.trailers}), Equipment/Assets(${counts.equipment}), Drivers(${allDrivers.length}), Total(${uniqueUnitsMap.size})`);

      return {
        success: true,
        data: mergedData,
        drivers: allDrivers,
        samsaraAssignments: allAssignments,
        summary: { ...counts, drivers: allDrivers.length },
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('❌ Samsara API 异常:', error);
      return { success: false, error: error.message || 'Unknown error', data: [], drivers: [], samsaraAssignments: [] };
    }
  });



// ==========================================
// 简单的内存缓存机制（节省 Google Maps API 费用）
// ==========================================
const geocodeCache = new Map<string, { lat: number; lng: number }>();
const routesCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟缓存过期时间

/**
 * 使用 Samsara Routes API 计算路线和 ETA
 * 需要 API Token 具有 Routes write permissions
 * 
 * 配置说明：请参考 SAMSARA_API_PERMISSIONS_SETUP.md
 */
export const calculateSamsaraRouteForVehicle = createServerFn({ method: "POST" })
  .inputValidator((data: {
    vehicleId: string;
    destinations: Array<{ address: string; name: string; latitude?: number; longitude?: number }>;
  }) => data)
  .handler(async ({ data }) => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || process.env.SAMSARA_API_KEY || import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;
    const GOOGLE_MAPS_API_KEY = (process.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_GOOGLE_MAPS_API_KEY) as string;

    console.log('🔄 Server Function: 计算车辆路线，车辆ID:', data.vehicleId, '目的地数量:', data.destinations.length);

    try {
      // ==========================================
      // 使用最新的 Google Maps Routes API (V2) 进行 ETA 计算
      // ==========================================
      if (!GOOGLE_MAPS_API_KEY) {
         throw new Error('缺少 Google Maps API Key，无法计算真实 ETA。');
      }

      // 组装 Waypoint 对象（如果是坐标则使用 latLng，如果是地址则直接使用 address）
      const createWaypoint = (dest: any) => {
        if (dest.latitude && dest.longitude) {
          return {
            location: {
              latLng: {
                latitude: dest.latitude,
                longitude: dest.longitude
              }
            }
          };
        } else {
          return { address: dest.address };
        }
      };

      const origin = createWaypoint(data.destinations[0]);
      const destination = createWaypoint(data.destinations[data.destinations.length - 1]);
      const intermediates = data.destinations.slice(1, data.destinations.length - 1).map(createWaypoint);

      const requestBody = {
        origin,
        destination,
        intermediates,
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE', // 修改为 TRAFFIC_UNAWARE 避免高级版收费
      };

      // 生成缓存 Key（对经纬度精确到小数点后3位，约100米，对地址直接使用字符串）
      const cacheKey = data.vehicleId + '_' + data.destinations.map(d => 
        d.latitude ? `${Math.round(d.latitude * 1000)},${Math.round(d.longitude! * 1000)}` : d.address
      ).join('|');

      const nowTime = Date.now();
      if (routesCache.has(cacheKey)) {
        const cached = routesCache.get(cacheKey)!;
        if (nowTime - cached.timestamp < CACHE_TTL_MS) {
          console.log('⚡ 使用缓存的 ETA 路线数据');
          return cached.data;
        } else {
          routesCache.delete(cacheKey);
        }
      }

      console.log('🔄 调用最新 Google Maps Routes API (v2) 计算 ETA...');
      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          // 指定我们只需要返回距离和时长字段，以节省流量和提高速度
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration'
        },
        body: JSON.stringify(requestBody)
      });

      const responseData = await response.json();

      if (!response.ok || responseData.error) {
        console.error('❌ Google Maps Routes API 错误:', responseData.error || responseData);
        return {
          success: false,
          error: `Google Maps Routes 计算失败: ${responseData.error?.message || response.status}`,
          legs: [],
          totalDistance: 0,
          totalDuration: 0,
        };
      }

      console.log('✅ Google Maps Routes 计算成功');

      const legs: Array<{ distance: number; duration: number }> = [];
      let totalDistance = 0;
      let totalDuration = 0;

      const route = responseData.routes?.[0];
      if (route && route.legs) {
        for (const leg of route.legs) {
          const distance = leg.distanceMeters || 0; 
          // duration 返回格式如 "1845s"，需要去掉 's' 并转为数字
          const duration = parseInt((leg.duration || '0s').replace('s', ''), 10); 
          
          legs.push({ distance, duration });
          totalDistance += distance;
          totalDuration += duration;
        }
      }

      const result = {
        success: true,
        legs,
        totalDistance,
        totalDuration,
        error: null as string | null,
      };

      // 存入缓存
      routesCache.set(cacheKey, { data: result, timestamp: nowTime });

      console.log('📤 返回结果:', { legsCount: legs.length, totalDistance, totalDuration });
      return result;

    } catch (error: any) {
      console.error('❌ ETA 计算异常:', error);

      return {
        success: false,
        error: error.message || 'Unknown error',
        legs: [],
        totalDistance: 0,
        totalDuration: 0,
      };
    }
  });

