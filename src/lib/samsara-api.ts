/**
 * Samsara API 辅助函数
 * 在开发环境直接调用 Samsara API（可能有 CORS 问题）
 * 在生产环境通过 /api/samsara 代理调用
 */

const SAMSARA_TOKEN = import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke';

export interface SamsaraVehicle {
  id: string;
  name: string;
  location: {
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
  };
  time?: string;
}

export interface SamsaraResponse {
  success: boolean;
  data: SamsaraVehicle[];
  error?: string;
  timestamp?: string;
}

/**
 * 获取 Samsara 车辆位置
 * 优先尝试使用 API 代理，如果失败则直接调用（开发环境）
 */
export async function fetchSamsaraVehicles(): Promise<SamsaraResponse> {
  // 首先尝试使用 API 代理
  try {
    console.log('🔄 尝试通过 API 代理获取 Samsara 数据...');
    const response = await fetch('/api/samsara');
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API 代理成功');
      return data;
    } else {
      console.log(`⚠️ API 代理返回错误: ${response.status}`);
    }
  } catch (error) {
    console.log('⚠️ API 代理不可用（本地开发环境正常），尝试直接调用 Samsara API...');
  }

  // 如果代理失败，尝试直接调用（开发环境）
  try {
    console.log('🔄 直接调用 Samsara API...');
    const response = await fetch('https://api.samsara.com/fleet/vehicles/locations', {
      headers: {
        'Authorization': `Bearer ${SAMSARA_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Samsara API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ 直接调用 Samsara API 成功');
    return {
      success: true,
      data: data.data || [],
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Samsara API 调用失败:', error);
    
    // 如果是 CORS 错误，提供更友好的提示
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      return {
        success: false,
        data: [],
        error: 'CORS 错误：本地开发环境无法直接访问 Samsara API。请部署到 Cloudflare Pages 后使用，或使用模拟数据进行开发。'
      };
    }
    
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
