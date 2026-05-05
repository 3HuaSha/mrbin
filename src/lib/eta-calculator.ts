/**
 * ETA (预计到达时间) 计算工具
 * 使用 Google Maps Distance Matrix API 计算从司机当前位置到订单位置的预计到达时间
 */

export interface ETAResult {
  orderId: string;
  orderAddress: string;
  distance: string; // 例如 "5.2 km"
  duration: string; // 例如 "12 mins"
  durationValue: number; // 秒数
  eta: Date; // 预计到达时间
  status: 'OK' | 'NOT_FOUND' | 'ZERO_RESULTS' | 'ERROR';
}

export interface DriverETA {
  driverId: string;
  driverName: string;
  currentLocation: { lat: number; lng: number } | null;
  orders: ETAResult[];
  totalDuration: number; // 总时长（秒）
  lastUpdated: Date;
}

/**
 * 计算司机到达所有订单位置的 ETA
 */
export async function calculateDriverETA(
  driverId: string,
  driverName: string,
  currentLocation: { lat: number; lng: number } | null,
  orders: Array<{ id: string; address: string }>,
  apiKey: string
): Promise<DriverETA> {
  if (!currentLocation || orders.length === 0) {
    return {
      driverId,
      driverName,
      currentLocation,
      orders: [],
      totalDuration: 0,
      lastUpdated: new Date(),
    };
  }

  const results: ETAResult[] = [];
  let cumulativeDuration = 0;

  // 按顺序计算每个订单的 ETA
  let previousLocation = currentLocation;

  for (const order of orders) {
    try {
      const result = await calculateSingleETA(
        previousLocation,
        order.address,
        apiKey
      );

      if (result.status === 'OK') {
        cumulativeDuration += result.durationValue;
        const eta = new Date(Date.now() + cumulativeDuration * 1000);

        results.push({
          orderId: order.id,
          orderAddress: order.address,
          distance: result.distance,
          duration: result.duration,
          durationValue: result.durationValue,
          eta,
          status: 'OK',
        });

        // 更新上一个位置为当前订单位置（用于计算下一个订单）
        if (result.destinationLocation) {
          previousLocation = result.destinationLocation;
        }
      } else {
        results.push({
          orderId: order.id,
          orderAddress: order.address,
          distance: 'N/A',
          duration: 'N/A',
          durationValue: 0,
          eta: new Date(),
          status: result.status,
        });
      }
    } catch (error) {
      console.error(`计算订单 ${order.id} 的 ETA 失败:`, error);
      results.push({
        orderId: order.id,
        orderAddress: order.address,
        distance: 'N/A',
        duration: 'N/A',
        durationValue: 0,
        eta: new Date(),
        status: 'ERROR',
      });
    }
  }

  return {
    driverId,
    driverName,
    currentLocation,
    orders: results,
    totalDuration: cumulativeDuration,
    lastUpdated: new Date(),
  };
}

/**
 * 计算单个路线的 ETA
 */
async function calculateSingleETA(
  origin: { lat: number; lng: number },
  destination: string,
  apiKey: string
): Promise<{
  distance: string;
  duration: string;
  durationValue: number;
  status: 'OK' | 'NOT_FOUND' | 'ZERO_RESULTS' | 'ERROR';
  destinationLocation?: { lat: number; lng: number };
}> {
  const originStr = `${origin.lat},${origin.lng}`;
  const destinationStr = `${destination}, Toronto, ON, Canada`;

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
    originStr
  )}&destinations=${encodeURIComponent(destinationStr)}&mode=driving&departure_time=now&traffic_model=best_guess&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Distance Matrix API 错误:', data.status);
      return {
        distance: 'N/A',
        duration: 'N/A',
        durationValue: 0,
        status: 'ERROR',
      };
    }

    const element = data.rows[0]?.elements[0];
    if (!element || element.status !== 'OK') {
      return {
        distance: 'N/A',
        duration: 'N/A',
        durationValue: 0,
        status: element?.status || 'ERROR',
      };
    }

    // 优先使用考虑实时交通的 duration_in_traffic
    const duration = element.duration_in_traffic || element.duration;

    return {
      distance: element.distance.text,
      duration: duration.text,
      durationValue: duration.value,
      status: 'OK',
      destinationLocation: data.destination_addresses[0]
        ? undefined
        : undefined, // 可以通过 Geocoding API 获取
    };
  } catch (error) {
    console.error('调用 Distance Matrix API 失败:', error);
    return {
      distance: 'N/A',
      duration: 'N/A',
      durationValue: 0,
      status: 'ERROR',
    };
  }
}

/**
 * 格式化 ETA 时间显示
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
