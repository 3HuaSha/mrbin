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
 * 使用 Google Maps Distance Matrix API 计算路线和 ETA
 * 传入车辆当前位置和目的地列表
 */
export const calculateSamsaraRouteForVehicle = createServerFn({ method: "POST" })
  .inputValidator((data: {
    vehicleId: string;
    destinations: Array<{ address: string; name: string }>;
  }) => data)
  .handler(async ({ data }) => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || process.env.SAMSARA_API_KEY || import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;
    const GOOGLE_MAPS_API_KEY = (process.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '') as string;
    
    console.log('🔄 Server Function: 计算车辆路线，车辆ID:', data.vehicleId, '目的地数量:', data.destinations.length);
    
    if (!GOOGLE_MAPS_API_KEY) {
      console.error('❌ 缺少 Google Maps API Key');
      return {
        success: false,
        error: 'Missing Google Maps API Key',
        legs: [],
        totalDistance: 0,
        totalDuration: 0,
      };
    }
    
    try {
      // 1. 获取车辆当前位置
      console.log('🔄 获取车辆位置...');
      const locationResponse = await fetch('https://api.samsara.com/fleet/vehicles/locations', {
        headers: {
          'Authorization': `Bearer ${SAMSARA_TOKEN}`,
          'Accept': 'application/json'
        }
      });

      if (!locationResponse.ok) {
        const errorText = await locationResponse.text();
        console.error('❌ 获取车辆位置失败:', locationResponse.status, errorText);
        throw new Error(`Failed to get vehicle locations: ${locationResponse.status}`);
      }

      const locationData = await locationResponse.json();
      const vehicles = locationData.data || [];
      const targetVehicle = vehicles.find((v: any) => v.id === data.vehicleId);
      
      if (!targetVehicle || !targetVehicle.location) {
        console.error('❌ 未找到车辆或车辆位置:', { vehicleId: data.vehicleId });
        throw new Error(`Vehicle location not found for vehicle ID: ${data.vehicleId}`);
      }
      
      const currentLocation = targetVehicle.location;
      console.log('✅ 获取到车辆位置:', currentLocation);

      // 2. 使用 Google Maps Distance Matrix API 计算路线
      // 构建路径点：当前位置 -> 目的地1 -> 目的地2 -> ...
      const waypoints = [
        `${currentLocation.latitude},${currentLocation.longitude}`,
        ...data.destinations.map(dest => encodeURIComponent(dest.address))
      ];

      const legs: Array<{ distance: number; duration: number }> = [];
      let totalDistance = 0;
      let totalDuration = 0;

      // 逐段计算距离和时长
      for (let i = 0; i < waypoints.length - 1; i++) {
        const origin = waypoints[i];
        const destination = waypoints[i + 1];
        
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&key=${GOOGLE_MAPS_API_KEY}`;
        
        console.log(`🔄 计算路段 ${i + 1}/${waypoints.length - 1}: ${origin} -> ${destination}`);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Google Maps API 错误:', response.status, errorText);
          throw new Error(`Google Maps API Error: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.status !== 'OK') {
          console.error('❌ Google Maps API 返回错误状态:', result.status);
          throw new Error(`Google Maps API Status: ${result.status}`);
        }

        const element = result.rows?.[0]?.elements?.[0];
        
        if (!element || element.status !== 'OK') {
          console.error('❌ 无法计算路段:', element?.status);
          throw new Error(`Cannot calculate route segment: ${element?.status}`);
        }

        const distance = element.distance?.value || 0; // 米
        const duration = element.duration?.value || 0; // 秒
        
        console.log(`✅ 路段 ${i + 1}: ${element.distance?.text}, ${element.duration?.text}`);
        
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
      
      console.log('📤 返回结果:', result);
      return result;
    } catch (error: any) {
      console.error('❌ 计算路线失败:', error);
      
      return {
        success: false,
        error: error.message || 'Unknown error',
        legs: [],
        totalDistance: 0,
        totalDuration: 0,
      };
    }
  });

