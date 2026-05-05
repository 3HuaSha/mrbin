/**
 * ETA (预计到达时间) 计算工具
 * 使用 Samsara Routes API 计算从司机当前位置到订单位置的预计到达时间
 */

import { calculateSamsaraRoute } from "@/actions/samsara";

export interface ETAResult {
  orderId: string;
  orderAddress: string;
  distance: number; // 米
  duration: number; // 秒
  eta: Date; // 预计到达时间
  status: 'OK' | 'ERROR';
}

export interface DriverETA {
  driverId: string;
  driverName: string;
  vehicleId: string;
  currentLocation: { lat: number; lng: number } | null;
  orders: ETAResult[];
  totalDistance: number; // 总距离（米）
  totalDuration: number; // 总时长（秒）
  lastUpdated: Date;
}

/**
 * 使用 Samsara API 计算司机到达所有订单位置的 ETA
 */
export async function calculateDriverETAWithSamsara(
  driverId: string,
  driverName: string,
  vehicleId: string,
  currentLocation: { lat: number; lng: number },
  orders: Array<{ id: string; address: string; lat?: number; lng?: number }>,
): Promise<DriverETA> {
  if (orders.length === 0) {
    return {
      driverId,
      driverName,
      vehicleId,
      currentLocation,
      orders: [],
      totalDistance: 0,
      totalDuration: 0,
      lastUpdated: new Date(),
    };
  }

  try {
    // 构建路线点：起点 + 所有订单位置
    const waypoints = [
      {
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        name: '当前位置'
      },
      ...orders.map(order => ({
        latitude: order.lat || 0,
        longitude: order.lng || 0,
        name: order.address
      }))
    ];

    // 调用 Samsara Routes API（通过 Server Function）
    const routeData = await calculateSamsaraRoute({ data: { waypoints } });

    if (!routeData.success) {
      throw new Error(routeData.error || 'Route calculation failed');
    }

    // 解析路线数据，为每个订单生成 ETA
    const results: ETAResult[] = [];
    let cumulativeDuration = 0;

    // routeData.legs 包含每段路线的信息
    routeData.legs?.forEach((leg: any, index: number) => {
      if (index < orders.length) {
        const order = orders[index];
        cumulativeDuration += leg.duration || 0;

        const eta = new Date(Date.now() + cumulativeDuration * 1000);

        results.push({
          orderId: order.id,
          orderAddress: order.address,
          distance: leg.distance || 0,
          duration: leg.duration || 0,
          eta,
          status: 'OK',
        });
      }
    });

    return {
      driverId,
      driverName,
      vehicleId,
      currentLocation,
      orders: results,
      totalDistance: routeData.totalDistance || 0,
      totalDuration: routeData.totalDuration || 0,
      lastUpdated: new Date(),
    };
  } catch (error) {
    console.error(`计算司机 ${driverName} 的 ETA 失败:`, error);
    
    // 返回错误状态
    return {
      driverId,
      driverName,
      vehicleId,
      currentLocation,
      orders: orders.map(order => ({
        orderId: order.id,
        orderAddress: order.address,
        distance: 0,
        duration: 0,
        eta: new Date(),
        status: 'ERROR' as const,
      })),
      totalDistance: 0,
      totalDuration: 0,
      lastUpdated: new Date(),
    };
  }
}

/**
 * 格式化距离显示
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} 米`;
  } else {
    return `${(meters / 1000).toFixed(1)} 公里`;
  }
}

/**
 * 格式化时长显示
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)} 秒`;
  } else if (seconds < 3600) {
    return `${Math.round(seconds / 60)} 分钟`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hours} 小时 ${mins} 分钟`;
  }
}

/**
 * 格式化 ETA 时间显示（相对时间）
 */
export function formatETA(eta: Date): string {
  const now = new Date();
  const diffMs = eta.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 0) {
    return '已过期';
  } else if (diffMins < 60) {
    return `${diffMins} 分钟`;
  } else {
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours} 小时 ${mins} 分钟`;
  }
}

/**
 * 格式化 ETA 时间点显示
 */
export function formatETATime(eta: Date): string {
  return eta.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
