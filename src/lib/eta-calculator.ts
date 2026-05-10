/**
 * ETA (预计到达时间) 计算工具
 * 使用 Samsara API 直接计算车辆到达地址的 ETA
 */

import { calculateSamsaraRouteForVehicle } from "@/actions/samsara";

// 卡车速度系数 (Google Routes 返回轿车时长, 卡车更慢)
const TRUCK_SPEED_FACTOR = 1.2;
// 每到一站的作业时间 (秒)
const STOP_DURATION_SEC = 15 * 60;

export interface ETAResult {
  orderId: string;
  orderAddress: string;
  distance: number; // 米
  duration: number; // 秒
  eta: string; // 预计到达时间 (ISO 字符串)
  status: 'OK' | 'ERROR';
}

export interface DriverETA {
  driverId: string;
  driverName: string;
  vehicleId: string;
  samsaraVehicleId: string;
  currentLocation: { lat: number; lng: number } | null;
  orders: ETAResult[];
  totalDistance: number; // 总距离（米）
  totalDuration: number; // 总时长（秒）
  lastUpdated: string; // ISO 字符串
}

/**
 * 使用 Samsara API 直接计算车辆到达订单的 ETA
 * Samsara 会自动使用车辆的当前位置作为起点
 */
export async function calculateDriverETAWithSamsara(
  driverId: string,
  driverName: string,
  vehicleId: string,
  samsaraVehicleId: string,
  currentLocation: { lat: number; lng: number },
  orders: Array<{ id: string; address: string }>,
): Promise<DriverETA> {
  if (orders.length === 0) {
    return {
      driverId,
      driverName,
      vehicleId,
      samsaraVehicleId,
      currentLocation,
      orders: [],
      totalDistance: 0,
      totalDuration: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  try {
    // 构建目的地列表，第一站必须是车辆当前位置
    const destinations = [
      {
        address: 'Current Location',
        name: '车辆当前位置',
        latitude: currentLocation.lat,
        longitude: currentLocation.lng
      },
      ...orders.map(order => ({
        address: order.address + ', Toronto, ON, Canada',
        name: order.address
      }))
    ];

    // 调用 Samsara Routes API（通过 Server Function）
    // 我们已经把车辆当前位置作为第一站，Samsara 会从这里开始计算
    console.log('🔄 调用 Samsara Routes API:', {
      samsaraVehicleId,
      destinations: destinations.length
    });
    
    const routeData = await calculateSamsaraRouteForVehicle({ 
      data: {
        vehicleId: samsaraVehicleId,
        destinations 
      }
    });

    console.log('📦 Samsara API 响应:', routeData);

    if (!routeData.success) {
      console.error('❌ Samsara API 失败:', routeData.error);
      throw new Error(routeData.error || 'Route calculation failed');
    }

    // 解析路线数据，为每个订单生成 ETA
    // 每段 duration * TRUCK_SPEED_FACTOR, 到达每站后加 STOP_DURATION_SEC 作业时间
    const results: ETAResult[] = [];
    let cumulativeDuration = 0;

    routeData.legs?.forEach((leg: any, index: number) => {
      if (index < orders.length) {
        const order = orders[index];
        const adjustedDriveSec = (leg.duration || 0) * TRUCK_SPEED_FACTOR;
        cumulativeDuration += adjustedDriveSec;

        const eta = new Date(Date.now() + cumulativeDuration * 1000);

        results.push({
          orderId: order.id,
          orderAddress: order.address,
          distance: leg.distance || 0,
          duration: adjustedDriveSec,
          eta: eta.toISOString(),
          status: 'OK',
        });

        // 下一站开始前, 先算本站 15 分钟作业时间
        cumulativeDuration += STOP_DURATION_SEC;
      }
    });

    return {
      driverId,
      driverName,
      vehicleId,
      samsaraVehicleId,
      currentLocation,
      orders: results,
      totalDistance: routeData.totalDistance || 0,
      totalDuration: routeData.totalDuration || 0,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`计算司机 ${driverName} 的 ETA 失败:`, error);
    
    // 返回错误状态
    return {
      driverId,
      driverName,
      vehicleId,
      samsaraVehicleId,
      currentLocation,
      orders: orders.map(order => ({
        orderId: order.id,
        orderAddress: order.address,
        distance: 0,
        duration: 0,
        eta: new Date().toISOString(), // 转换为 ISO 字符串
        status: 'ERROR' as const,
      })),
      totalDistance: 0,
      totalDuration: 0,
      lastUpdated: new Date().toISOString(),
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
export function formatETA(etaString: string): string {
  const eta = new Date(etaString);
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
export function formatETATime(etaString: string): string {
  const eta = new Date(etaString);
  return eta.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
