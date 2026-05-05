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
 */
export const calculateSamsaraRoute = createServerFn({ method: "POST" })
  .validator((data: {
    waypoints: Array<{ latitude: number; longitude: number; name: string }>;
  }) => data)
  .handler(async ({ data }) => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || process.env.SAMSARA_API_KEY || import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;
    
    console.log('🔄 Server Function: 计算 Samsara 路线，路径点数量:', data.waypoints.length);
    
    try {
      const url = 'https://api.samsara.com/fleet/routes/calculate';

      const requestBody = {
        waypoints: data.waypoints,
        optimize: false, // 不优化顺序，按给定顺序计算
        departureTime: new Date().toISOString(),
      };

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
        console.error('❌ Samsara Routes API 错误:', response.status, errorText);
        return {
          success: false,
          error: `Samsara API Error: ${response.status} - ${errorText}`,
          legs: []
        };
      }

      const responseData = await response.json();
      console.log('✅ Samsara Routes API 成功');
      
      // 解析响应数据
      const legs = responseData.route?.legs || responseData.legs || [];

      return {
        success: true,
        legs: legs.map((leg: any) => ({
          distance: leg.distance || leg.distanceMeters || 0,
          duration: leg.duration || leg.durationSeconds || 0,
        })),
        totalDistance: responseData.route?.totalDistance || 0,
        totalDuration: responseData.route?.totalDuration || 0,
      };
    } catch (error: any) {
      console.error('❌ Samsara Routes API 异常:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
        legs: []
      };
    }
  });

