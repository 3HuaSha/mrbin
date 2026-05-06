import { createServerFn } from "@tanstack/react-start";

export const fetchSamsaraData = createServerFn({ method: "GET" })
  .handler(async () => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || process.env.SAMSARA_API_KEY || import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;
    
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
    destinations: Array<{ address: string; name: string }>;
  }) => data)
  .handler(async ({ data }) => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || process.env.SAMSARA_API_KEY || import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;
    
    console.log('🔄 Server Function: 计算车辆路线，车辆ID:', data.vehicleId, '目的地数量:', data.destinations.length);
    
    try {
      // 使用 Samsara 的 Create Route API 来计算 ETA
      // 创建一个临时路线，设置 autoCalculateSchedule=true 让 Samsara 自动计算时间
      const url = 'https://api.samsara.com/fleet/routes';

      // 构建路线停靠点
      const now = new Date();
      const stops = data.destinations.map((dest, index) => ({
        singleUseLocation: {
          address: dest.address,
          name: dest.name
        },
        // 只需要提供一个初始时间，autoCalculateSchedule 会重新计算
        scheduledArrivalTime: new Date(now.getTime() + (index + 1) * 30 * 60 * 1000).toISOString()
      }));

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

      console.log('📡 Create Route API 响应状态:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Samsara Create Route API 错误:', response.status, errorText);
        
        // 如果是权限错误，返回更友好的错误信息
        if (response.status === 401 && errorText.includes('Routes write permissions')) {
          return {
            success: false,
            error: 'API Token 缺少 Routes write permissions。请参考 SAMSARA_API_PERMISSIONS_SETUP.md 配置权限。',
            legs: [],
            totalDistance: 0,
            totalDuration: 0,
          };
        }
        
        return {
          success: false,
          error: `Samsara API Error: ${response.status} - ${errorText}`,
          legs: [],
          totalDistance: 0,
          totalDuration: 0,
        };
      }

      const responseData = await response.json();
      console.log('✅ Samsara Create Route API 成功');
      
      // 提取路线 ID，稍后删除
      const routeId = responseData.id;
      
      // 解析停靠点数据来计算距离和时长
      const routeStops = responseData.stops || [];
      const legs: Array<{ distance: number; duration: number }> = [];
      let totalDistance = 0;
      let totalDuration = 0;

      // 计算每段路程的时长和距离
      for (let i = 0; i < routeStops.length - 1; i++) {
        const currentStop = routeStops[i];
        const nextStop = routeStops[i + 1];
        
        const arrivalTime = new Date(currentStop.scheduledArrivalTime || currentStop.scheduledDepartureTime).getTime();
        const nextArrivalTime = new Date(nextStop.scheduledArrivalTime).getTime();
        
        const duration = Math.floor((nextArrivalTime - arrivalTime) / 1000); // 转换为秒
        
        // Samsara 可能不直接提供距离，我们用时长估算（假设平均速度 50 km/h）
        const distance = Math.floor(duration * 50 / 3.6); // 米
        
        legs.push({ distance, duration });
        totalDistance += distance;
        totalDuration += duration;
      }

      // 删除临时路线
      if (routeId) {
        try {
          await fetch(`https://api.samsara.com/fleet/routes/${routeId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${SAMSARA_TOKEN}`,
              'Accept': 'application/json'
            }
          });
          console.log('🗑️ 已删除临时路线:', routeId);
        } catch (deleteError) {
          console.warn('⚠️ 删除临时路线失败（不影响结果）:', deleteError);
        }
      }

      const result = {
        success: true,
        legs,
        totalDistance,
        totalDuration,
        error: null as string | null,
      };
      
      console.log('📤 返回结果:', result);
      return result;
    } catch (error: any) {
      console.error('❌ Samsara Route API 异常:', error);
      
      return {
        success: false,
        error: error.message || 'Unknown error',
        legs: [],
        totalDistance: 0,
        totalDuration: 0,
      };
    }
  });

