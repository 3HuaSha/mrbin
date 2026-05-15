/**
 * 路线时间缓存系统
 * 
 * 策略:
 * 1. 先查 Supabase route_cache 表
 * 2. 缓存命中 → 直接返回
 * 3. 缓存未命中 → 调用 Google Routes API 计算, 结果存入缓存
 * 
 * 使用场景:
 * - 拖拽调整顺序时, 用缓存的分段时间相加显示预估总时间
 * - 场地↔砖厂的路线是固定的, 算一次永久复用
 * - 客户地址第一次出现时算一次, 之后复用
 */

import { supabase } from "@/integrations/supabase/client";

// 每站装卸时间 (秒)
export const STOP_DURATION_SEC = 15 * 60; // 15分钟

// 内存缓存 (避免同一会话内重复查数据库)
const memoryCache = new Map<string, { duration: number; distance: number }>();

function cacheKey(origin: string, destination: string): string {
  return `${origin.trim().toLowerCase()}|||${destination.trim().toLowerCase()}`;
}

/**
 * 获取两点之间的行驶时间 (秒) 和距离 (米)
 * 优先从缓存读取, 缓存未命中时调用 Google Routes API
 */
export async function getRouteDuration(
  origin: string,
  destination: string
): Promise<{ duration: number; distance: number } | null> {
  if (!origin || !destination) return null;

  const key = cacheKey(origin, destination);

  // 1. 查内存缓存
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }

  // 2. 查数据库缓存
  try {
    const { data } = await supabase
      .from("route_cache")
      .select("duration_seconds, distance_meters")
      .eq("origin_address", origin.trim())
      .eq("destination_address", destination.trim())
      .single();

    if (data) {
      const result = { duration: data.duration_seconds, distance: data.distance_meters };
      memoryCache.set(key, result);
      return result;
    }
  } catch {
    // 查询失败不影响流程
  }

  // 3. 缓存未命中 → 调用 Google Routes API
  try {
    const { calculateSamsaraRouteForVehicle } = await import("@/actions/samsara");
    const routeData = await calculateSamsaraRouteForVehicle({
      data: {
        vehicleId: 'cache-calc', // 不需要真实车辆 ID
        destinations: [
          { address: origin, name: 'origin' },
          { address: destination, name: 'destination' },
        ],
      },
    });

    if (routeData.success && routeData.legs && routeData.legs.length > 0) {
      const leg = routeData.legs[0];
      const result = { duration: leg.duration || 0, distance: leg.distance || 0 };

      // 存入数据库缓存
      try {
        await supabase.from("route_cache").upsert({
          origin_address: origin.trim(),
          destination_address: destination.trim(),
          duration_seconds: result.duration,
          distance_meters: result.distance,
        }, { onConflict: 'origin_address,destination_address' });
      } catch {
        // 写入失败不影响返回
      }

      // 存入内存缓存
      memoryCache.set(key, result);
      return result;
    }
  } catch (error) {
    console.warn('路线计算失败:', origin, '→', destination, error);
  }

  return null;
}

/**
 * 批量获取多段路线的时间 (用于计算一个司机的总行程时间)
 * 返回每段的时间, 以及总时间
 */
export async function getRouteSegments(
  addresses: string[]
): Promise<{
  segments: Array<{ from: string; to: string; duration: number; distance: number }>;
  totalDuration: number;
  totalDistance: number;
  missingSegments: Array<{ from: string; to: string }>;
}> {
  if (addresses.length < 2) {
    return { segments: [], totalDuration: 0, totalDistance: 0, missingSegments: [] };
  }

  const segments: Array<{ from: string; to: string; duration: number; distance: number }> = [];
  const missingSegments: Array<{ from: string; to: string }> = [];
  let totalDuration = 0;
  let totalDistance = 0;

  for (let i = 0; i < addresses.length - 1; i++) {
    const from = addresses[i];
    const to = addresses[i + 1];
    const result = await getRouteDuration(from, to);

    if (result) {
      segments.push({ from, to, duration: result.duration, distance: result.distance });
      totalDuration += result.duration + STOP_DURATION_SEC; // 加上装卸时间
      totalDistance += result.distance;
    } else {
      segments.push({ from, to, duration: 0, distance: 0 });
      missingSegments.push({ from, to });
    }
  }

  return { segments, totalDuration, totalDistance, missingSegments };
}

/**
 * 格式化秒数为可读时间
 */
export function formatSeconds(seconds: number): string {
  if (seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${mins}min`;
  return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
}

/**
 * 预热缓存: 批量计算并缓存一组路线
 * 用于一次性计算场地↔砖厂的所有路线
 */
export async function warmupCache(
  routes: Array<{ origin: string; destination: string }>
): Promise<{ cached: number; failed: number }> {
  let cached = 0;
  let failed = 0;

  for (const route of routes) {
    const result = await getRouteDuration(route.origin, route.destination);
    if (result) {
      cached++;
    } else {
      failed++;
    }
    // 避免 API 限流, 每次调用间隔 200ms
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return { cached, failed };
}
