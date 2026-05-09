import { createServerFn } from "@tanstack/react-start";

/**
 * 获取 Samsara 原始数据
 */
export const fetchSamsaraData = createServerFn({ method: "GET" })
  .handler(async () => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;
    const headers = { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' };

    try {
      console.log('🚀 开始从 Samsara 抓取全量数据...');
      
      // 1. 获取车辆
      const vRes = await fetch('https://api.samsara.com/fleet/vehicles?limit=512', { headers });
      const vehicles = vRes.ok ? (await vRes.json()).data : [];

      // 2. 获取资产
      const assetRes = await fetch('https://api.samsara.com/fleet/assets?limit=512', { headers });
      const assets = assetRes.ok ? (await assetRes.json()).data : [];

      // 3. 获取司机
      const dRes = await fetch('https://api.samsara.com/fleet/drivers?limit=512&includeDeactivated=true', { headers });
      const drivers = dRes.ok ? (await dRes.json()).data : [];

      // 4. 获取实时分配 (修正 400 错误：添加必要的 filterBy)
      // 注意：有些账号可能不支持不带参数的调用
      const aRes = await fetch('https://api.samsara.com/fleet/driver-vehicle-assignments?filterBy=drivers', { headers });
      let assignments = [];
      if (aRes.ok) {
        const result = await aRes.json();
        assignments = (result.data || []).filter((a: any) => !a.endTime);
      } else {
        console.warn(`[Assignments API Error] Status: ${aRes.status}`);
      }

      // 5. 获取车辆实时状态 (修正 400 错误：尝试更通用的 types)
      const sRes = await fetch('https://api.samsara.com/fleet/vehicles/stats?types=obdDriver,fuelPerc,engineStates', { headers });
      let vehicleStats = [];
      if (sRes.ok) {
        const result = await sRes.json();
        vehicleStats = result.data || [];
      } else {
        console.warn(`[Stats API Error] Status: ${sRes.status}`);
      }

      // 6. 获取位置信息 ( locations 接口通常很稳)
      const lRes = await fetch('https://api.samsara.com/fleet/vehicles/locations', { headers });
      const locations = lRes.ok ? (await lRes.json()).data : [];

      return {
        success: true,
        vehicles: [...vehicles, ...assets],
        drivers,
        assignments,
        vehicleStats,
        locations,
        debug: {
          vStatus: vRes.status,
          aStatus: aRes.status,
          sStatus: sRes.status,
          lStatus: lRes.status
        }
      };
    } catch (error: any) {
      console.error('❌ Samsara 抓取失败:', error);
      return { success: false, error: error.message };
    }
  });

/**
 * 使用 Google Maps Routes API 计算路线和 ETA
 */
export const calculateSamsaraRouteForVehicle = createServerFn({ method: "POST" })
  .inputValidator((data: {
    vehicleId: string;
    destinations: Array<{ address: string; name: string; latitude?: number; longitude?: number }>;
  }) => data)
  .handler(async ({ data }) => {
    const GOOGLE_MAPS_API_KEY = (process.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_GOOGLE_MAPS_API_KEY) as string;
    try {
      if (!GOOGLE_MAPS_API_KEY) throw new Error('缺少 Google Maps API Key');
      const createWaypoint = (dest: any) => dest.latitude && dest.longitude ? { location: { latLng: { latitude: dest.latitude, longitude: dest.longitude } } } : { address: dest.address };
      const requestBody = { origin: createWaypoint(data.destinations[0]), destination: createWaypoint(data.destinations[data.destinations.length - 1]), intermediates: data.destinations.slice(1, data.destinations.length - 1).map(createWaypoint), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' };
      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration' },
        body: JSON.stringify(requestBody)
      });
      const responseData = await response.json();
      if (!response.ok || responseData.error) throw new Error(responseData.error?.message || 'Routes API 错误');
      const legs: any[] = [];
      let totalDist = 0;
      let totalDur = 0;
      responseData.routes?.[0]?.legs?.forEach((leg: any) => {
        const dist = leg.distanceMeters || 0;
        const dur = parseInt((leg.duration || '0s').replace('s', ''), 10);
        legs.push({ distance: dist, duration: dur });
        totalDist += dist;
        totalDur += dur;
      });
      return { success: true, legs, totalDistance: totalDist, totalDuration: totalDur, error: null };
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error', legs: [], totalDistance: 0, totalDuration: 0 };
    }
  });
