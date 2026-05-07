import { createServerFn } from "@tanstack/react-start";

export const fetchSamsaraData = createServerFn({ method: "GET" })
  .handler(async () => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || process.env.SAMSARA_API_KEY || import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;
    const GOOGLE_MAPS_API_KEY = (process.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_GOOGLE_MAPS_API_KEY) as string;

    console.log('🔄 Server Function: 开始获取 Samsara 数据');

    try {
      const response = await fetch('https://api.samsara.com/fleet/vehicles/locations', {
        headers: {
          'Authorization': `Bearer ${SAMSARA_TOKEN}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Samsara API 错误:', response.status, errorText);
        throw new Error(`Samsara API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Samsara API 成功，获取到', data.data?.length || 0, '辆车');

      return {
        success: true,
        data: data.data || [],
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
      // 自动解析缺失的经纬度
      for (const dest of data.destinations) {
        if (!dest.latitude || !dest.longitude) {
          if (!GOOGLE_MAPS_API_KEY) {
            console.warn(`⚠️ 缺少 Google Maps API Key，无法解析地址: ${dest.address}`);
            continue;
          }
          try {
            const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(dest.address)}&key=${GOOGLE_MAPS_API_KEY}`;
            const geoRes = await fetch(geoUrl);
            const geoData = await geoRes.json();
            if (geoData.status === 'OK' && geoData.results.length > 0) {
              dest.latitude = geoData.results[0].geometry.location.lat;
              dest.longitude = geoData.results[0].geometry.location.lng;
              console.log(`📍 地址解析成功: ${dest.address} -> ${dest.latitude}, ${dest.longitude}`);
            } else {
              console.warn(`⚠️ 无法解析地址经纬度: ${dest.address}, 状态: ${geoData.status}`);
            }
          } catch (geoErr) {
            console.error(`❌ 解析地址经纬度异常: ${dest.address}`, geoErr);
          }
        }
      }

      // 使用 Samsara 的 Create Route API 来计算 ETA
      // 创建一个临时路线，设置 autoCalculateSchedule=true 让 Samsara 自动计算时间
      const url = 'https://api.samsara.com/fleet/routes';

      // 构建路线停靠点
      const now = new Date();
      
      // 检查是否有任何一个地址无法解析经纬度
      const failedDests = data.destinations.filter(d => !d.latitude || !d.longitude);
      if (failedDests.length > 0) {
        return {
          success: false,
          error: `无法计算 ETA: 以下地址无法通过 Google Maps 找到经纬度坐标 (${failedDests.map(d => d.address).join(' | ')})`,
          legs: [],
          totalDistance: 0,
          totalDuration: 0,
        };
      }

      const stops = data.destinations.map((dest, index) => {
        const stop: any = {
          singleUseLocation: {
            address: dest.address,
            name: dest.name,
            latitude: dest.latitude,
            longitude: dest.longitude
          }
        };
        // 只需要提供一个初始时间，Samsara 强制要求每一站都有时间
        // 如果 routeStartingCondition 是 departFirstStop，第一站必须设置 scheduledDepartureTime
        if (index === 0) {
          stop.scheduledDepartureTime = now.toISOString();
        } else {
          stop.scheduledArrivalTime = new Date(now.getTime() + (index + 1) * 30 * 60 * 1000).toISOString();
        }
        return stop;
      });

      // ==========================================
      // 使用 Google Maps Directions API 进行精准、同步的 ETA 计算
      // ==========================================
      if (!GOOGLE_MAPS_API_KEY) {
         throw new Error('缺少 Google Maps API Key，无法计算真实 ETA。');
      }

      const origin = `${stops[0].singleUseLocation.latitude},${stops[0].singleUseLocation.longitude}`;
      const destination = `${stops[stops.length - 1].singleUseLocation.latitude},${stops[stops.length - 1].singleUseLocation.longitude}`;
      
      const waypoints = stops.slice(1, stops.length - 1).map(s => 
        `${s.singleUseLocation.latitude},${s.singleUseLocation.longitude}`
      );
      
      let directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${GOOGLE_MAPS_API_KEY}`;
      if (waypoints.length > 0) {
        directionsUrl += `&waypoints=${waypoints.join('|')}`;
      }

      console.log('🔄 调用 Google Maps Directions API 计算 ETA...');
      const response = await fetch(directionsUrl);
      const responseData = await response.json();

      if (responseData.status !== 'OK') {
        console.error('❌ Google Maps Directions API 错误:', responseData.status, responseData.error_message);
        return {
          success: false,
          error: `Google Maps 路线计算失败: ${responseData.status}`,
          legs: [],
          totalDistance: 0,
          totalDuration: 0,
        };
      }

      console.log('✅ Google Maps 路线计算成功');

      const legs: Array<{ distance: number; duration: number }> = [];
      let totalDistance = 0;
      let totalDuration = 0;

      // Google 返回的 legs 刚好对应我们停靠点之间的每一段路程
      const route = responseData.routes[0];
      for (const leg of route.legs) {
        const distance = leg.distance.value; // 米
        const duration = leg.duration.value; // 秒
        
        legs.push({ distance, duration });
        totalDistance += distance;
        totalDuration += duration;
      }

      const result = {
        success: true,
        legs,
        totalDistance,
        totalDuration,
        error: null as string | null,
      };

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

