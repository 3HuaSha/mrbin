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

      const requestBody = {
        name: `ETA_CALC_${Date.now()}`, // 临时路线名称
        vehicleId: data.vehicleId,
        autoCalculateSchedule: true, // 让 Samsara 自动计算时间表
        stops: stops,
        settings: {
          routeStartingCondition: 'departFirstStop',
          routeCompletionCondition: 'arriveLastStop'
        }
      };

      console.log('🔄 创建临时路线以计算 ETA:', { url, stops: stops.length });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SAMSARA_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Samsara Create Route API 错误:', response.status, errorText);
        return {
          success: false,
          error: `Samsara API Error: ${response.status} - ${errorText}`,
          legs: [],
          totalDistance: 0,
          totalDuration: 0,
        };
      }

      const responseData = await response.json();
      const routeData = responseData.data || responseData;
      const routeId = routeData.id;

      console.log('✅ 路线创建成功，ID:', routeId, '等待 Samsara 后台计算 ETA...');

      // 强制等待 3 秒，让 Samsara 后台有时间计算真实的 ETA
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 去 GET /fleet/routes/{id} 拉取带有真实 ETA 的数据
      const getResponse = await fetch(`https://api.samsara.com/fleet/routes/${routeId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SAMSARA_TOKEN}`,
          'Accept': 'application/json'
        }
      });

      let routeStops = routeData.stops || [];
      if (getResponse.ok) {
        const getResponseData = await getResponse.json();
        const getRouteData = getResponseData.data || getResponseData;
        if (getRouteData.stops && getRouteData.stops.length > 0) {
           console.log('✅ 成功拉取到更新后的路线数据');
           routeStops = getRouteData.stops;
        }
      } else {
        console.warn('⚠️ 无法拉取更新后的路线，将使用默认返回时间');
      }

      // 删除临时路线，保持系统干净
      if (routeId) {
        try {
          await fetch(`https://api.samsara.com/fleet/routes/${routeId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${SAMSARA_TOKEN}`,
              'Accept': 'application/json'
            }
          });
          console.log('🗑️ 已清理临时路线:', routeId);
        } catch (deleteError) {
          console.warn('⚠️ 删除临时路线失败:', deleteError);
        }
      }

      const legs: Array<{ distance: number; duration: number }> = [];
      let totalDistance = 0;
      let totalDuration = 0;

      // 计算每段路程的时长和距离
      for (let i = 0; i < routeStops.length - 1; i++) {
        const currentStop = routeStops[i];
        const nextStop = routeStops[i + 1];

        // 优先使用 estimatedArrivalTime，如果没有则回退到 scheduled
        const currentArrival = currentStop.eta?.estimatedArrivalTime || currentStop.estimatedArrivalTime || currentStop.scheduledArrivalTime || currentStop.scheduledDepartureTime;
        const nextArrival = nextStop.eta?.estimatedArrivalTime || nextStop.estimatedArrivalTime || nextStop.scheduledArrivalTime || nextStop.scheduledDepartureTime;

        const arrivalTime = new Date(currentArrival).getTime();
        const nextArrivalTime = new Date(nextArrival).getTime();

        const duration = Math.floor((nextArrivalTime - arrivalTime) / 1000); // 转换为秒

        // Samsara 不直接提供这段路程的精确米数，只能通过时长估算 (按50km/h算)
        const distance = Math.floor(duration * 50 / 3.6); 

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

      console.log('📤 最终返回结果:', { legsCount: legs.length, totalDistance, totalDuration });
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

