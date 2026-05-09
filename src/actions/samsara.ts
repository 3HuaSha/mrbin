import { createServerFn } from "@tanstack/react-start";

export const fetchSamsaraData = createServerFn({ method: "GET" })
  .handler(async () => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || process.env.SAMSARA_API_KEY || import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;
    
    console.log('🔄 Server Function: 开始同步 Samsara 全量车辆数据');

    try {
      // 1. 获取所有车辆基本信息 (支持分页)
      let allVehicles: any[] = [];
      let hasNextPage = true;
      let after = '';

      while (hasNextPage) {
        const url = `https://api.samsara.com/fleet/vehicles${after ? `?after=${after}` : ''}`;
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${SAMSARA_TOKEN}`,
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Samsara Vehicles API Error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        allVehicles = [...allVehicles, ...(result.data || [])];
        
        hasNextPage = result.pagination?.hasNextPage || false;
        after = result.pagination?.endCursor || '';
      }

      console.log('✅ 获取到', allVehicles.length, '辆车辆元数据');

      // 2. 获取所有车辆位置信息 (用于地图显示)
      let allLocations: any[] = [];
      hasNextPage = true;
      after = '';

      while (hasNextPage) {
        const url = `https://api.samsara.com/fleet/vehicles/locations${after ? `?after=${after}` : ''}`;
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${SAMSARA_TOKEN}`,
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          // 如果位置接口失败，我们仍然返回车辆列表，只是没有位置
          console.error('❌ 获取 Samsara 位置失败，仅同步元数据');
          break;
        }

        const result = await response.json();
        allLocations = [...allLocations, ...(result.data || [])];
        
        hasNextPage = result.pagination?.hasNextPage || false;
        after = result.pagination?.endCursor || '';
      }

      // 3. 合并数据
      const locationMap = new Map();
      allLocations.forEach(loc => {
        locationMap.set(loc.id, loc);
      });

      const mergedData = allVehicles.map(v => {
        const locInfo = locationMap.get(v.id);
        return {
          id: v.id,
          name: v.name,
          location: locInfo?.location || null,
          time: locInfo?.time || null
        };
      });

      console.log('✅ 数据合并完成，总计', mergedData.length, '辆车');

      return {
        success: true,
        data: mergedData,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('❌ Samsara API 异常:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
        data: []
      };
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

