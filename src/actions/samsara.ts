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
 * 传入车辆 ID，Samsara 会自动使用车辆的当前位置作为起点
 */
export const calculateSamsaraRouteForVehicle = createServerFn({ method: "POST" })
  .handler(async (data: {
    vehicleId: string;
    destinations: Array<{ address: string; name: string }>;
  }) => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || process.env.SAMSARA_API_KEY || import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;
    
    console.log('🔄 Server Function: 计算车辆路线，车辆ID:', data.vehicleId, '目的地数量:', data.destinations.length);
    
    try {
      // 方法1: 使用 Samsara 的 Vehicle Routes API
      // 这个 API 会自动使用车辆的当前位置作为起点
      const url = `https://api.samsara.com/fleet/vehicles/${data.vehicleId}/routes`;

      const requestBody = {
        destinations: data.destinations.map(dest => ({
          address: dest.address,
          name: dest.name
        })),
        departureTime: new Date().toISOString(),
      };

      console.log('🔄 调用 Vehicle Routes API:', { url, requestBody });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SAMSARA_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      console.log('📡 Vehicle Routes API 响应状态:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Samsara Vehicle Routes API 错误:', response.status, errorText);
        
        // 如果这个 API 不可用，尝试使用通用的 Routes API
        console.log('🔄 尝试使用通用 Routes API...');
        return await fallbackToGeneralRoutesAPI(data, SAMSARA_TOKEN);
      }

      const responseData = await response.json();
      console.log('✅ Samsara Vehicle Routes API 成功:', responseData);
      
      // 解析响应数据
      const legs = responseData.route?.legs || responseData.legs || [];

      const result = {
        success: true,
        legs: legs.map((leg: any) => ({
          distance: leg.distanceMeters || leg.distance || 0,
          duration: leg.durationSeconds || leg.duration || 0,
        })),
        totalDistance: responseData.route?.totalDistanceMeters || responseData.totalDistance || 0,
        totalDuration: responseData.route?.totalDurationSeconds || responseData.totalDuration || 0,
        error: null,
      };
      
      console.log('📤 返回结果:', result);
      return result;
    } catch (error: any) {
      console.error('❌ Samsara Vehicle Routes API 异常:', error);
      
      // 尝试使用备用方法
      console.log('🔄 尝试使用备用方法...');
      return await fallbackToGeneralRoutesAPI(data, SAMSARA_TOKEN);
    }
  });

/**
 * 备用方法：使用通用的 Routes API
 * 需要先获取车辆当前位置，然后计算路线
 */
async function fallbackToGeneralRoutesAPI(
  data: { vehicleId: string; destinations: Array<{ address: string; name: string }> },
  token: string
) {
  try {
    // 1. 获取车辆当前位置
    const locationResponse = await fetch(`https://api.samsara.com/fleet/vehicles/${data.vehicleId}/locations`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!locationResponse.ok) {
      throw new Error('Failed to get vehicle location');
    }

    const locationData = await locationResponse.json();
    const location = locationData.data?.[0]?.location || locationData.location;

    if (!location) {
      throw new Error('Vehicle location not found');
    }

    // 2. 使用通用 Routes API 计算路线
    const routesUrl = 'https://api.samsara.com/fleet/routes';
    
    const waypoints = [
      {
        latitude: location.latitude,
        longitude: location.longitude,
        name: '当前位置'
      },
      ...data.destinations.map(dest => ({
        address: dest.address,
        name: dest.name
      }))
    ];

    const routesResponse = await fetch(routesUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        waypoints,
        departureTime: new Date().toISOString(),
      })
    });

    if (!routesResponse.ok) {
      const errorText = await routesResponse.text();
      console.error('❌ Samsara Routes API 错误:', routesResponse.status, errorText);
      return {
        success: false,
        error: `Samsara API Error: ${routesResponse.status}`,
        legs: [],
        totalDistance: 0,
        totalDuration: 0,
      };
    }

    const routesData = await routesResponse.json();
    console.log('✅ 备用方法成功');

    const legs = routesData.route?.legs || routesData.legs || [];

    return {
      success: true,
      legs: legs.map((leg: any) => ({
        distance: leg.distanceMeters || leg.distance || 0,
        duration: leg.durationSeconds || leg.duration || 0,
      })),
      totalDistance: routesData.route?.totalDistanceMeters || routesData.totalDistance || 0,
      totalDuration: routesData.route?.totalDurationSeconds || routesData.totalDuration || 0,
      error: null,
    };
  } catch (error: any) {
    console.error('❌ 备用方法失败:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
      legs: [],
      totalDistance: 0,
      totalDuration: 0,
    };
  }
}

