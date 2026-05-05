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
