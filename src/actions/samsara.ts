import { createServerFn } from "@tanstack/react-start";
import { SamsaraClient } from "@samsarahq/samsara";

export const fetchSamsaraData = createServerFn({ method: "GET" })
  .handler(async () => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;
    
    console.log('🔄 Server Function: 开始通过 SDK 获取 Samsara 数据');
    
    try {
      const client = new SamsaraClient({ token: SAMSARA_TOKEN });
      
      // 使用 SDK 获取车辆数据。如果需要专门获取车辆位置 (locations)，请查阅 SDK 中对应的位置接口 (例如 client.fleet.vehiclesLocations.list())
      const response = await client.vehicles.list();
      const vehicles = [];
      
      // 遍历异步生成器获取所有车辆
      for await (const item of response) {
        vehicles.push(item);
      }

      console.log('✅ Samsara API 成功，获取到', vehicles.length, '条数据');
      
      return {
        success: true,
        data: vehicles,
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
