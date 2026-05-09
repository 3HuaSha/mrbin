/**
 * Samsara API 辅助函数
 * 在开发环境直接调用 Samsara API（可能有 CORS 问题）
 * 在生产环境通过 /api/samsara 代理调用
 */



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

import { fetchSamsaraData } from "@/actions/samsara";

/**
 * 获取 Samsara 车辆位置
 * 通过 TanStack Server Function 在服务端安全获取数据
 */
export async function fetchSamsaraVehicles(): Promise<SamsaraResponse> {
  try {
    console.log('🔄 尝试通过 Server Function 获取 Samsara 数据...');
    const result = await fetchSamsaraData();
    
    if (result.success) {
      console.log('✅ Server Function 获取成功');
      // 关键修复：DispatchMapWidget 期望数据在 data 字段中，且包含位置信息
      return {
        success: true,
        data: (result as any).locations || [],
        timestamp: new Date().toISOString()
      };
    } else {
      console.error('❌ Server Function 返回错误:', result.error);
      return {
        success: false,
        data: [],
        error: (result as any).error
      };
    }
  } catch (error) {
    console.error('❌ Server Function 调用异常:', error);
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
