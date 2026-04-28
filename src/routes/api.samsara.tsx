import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/samsara')({
  loader: async () => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;
    
    console.log('🔄 TanStack Start API (Loader): 开始获取 Samsara 数据');
    
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
        return json({
          success: false,
          error: `Samsara API Error: ${response.status} - ${errorText}`,
          data: []
        }, {
          status: response.status as any
        });
      }

      const data = await response.json();
      console.log('✅ Samsara API 成功，获取到', data.data?.length || 0, '辆车');
      
      return json({
        success: true,
        data: data.data || [],
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('❌ Samsara API 异常:', error);
      return json({
        success: false,
        error: error.message || 'Unknown error',
        data: []
      }, {
        status: 500
      });
    }
  }
})
