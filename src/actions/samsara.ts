import { createServerFn } from "@tanstack/react-start";

/**
 * 获取 Samsara 原始数据
 */
export const fetchSamsaraData = createServerFn({ method: "GET" })
  .handler(async () => {
    const SAMSARA_TOKEN = process.env.VITE_SAMSARA_TOKEN;
    if (!SAMSARA_TOKEN) {
      throw new Error("Missing VITE_SAMSARA_TOKEN");
    }
    const headers = { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' };

    try {
      // 1. 获取车辆（带分页，防止 >512 时被截断）
      const vehicles: any[] = [];
      let vAfter: string | undefined;
      let vStatus = 0;
      let vPages = 0;
      do {
        const url = `https://api.samsara.com/fleet/vehicles?limit=512${vAfter ? `&after=${encodeURIComponent(vAfter)}` : ''}`;
        const vRes = await fetch(url, { headers });
        vStatus = vRes.status;
        if (!vRes.ok) {
          const errText = await vRes.text();
          console.error(`[Samsara] /fleet/vehicles 第 ${vPages + 1} 页失败 (${vStatus}):`, errText);
          break;
        }
        const body = await vRes.json();
        const pageData = body.data || [];
        vehicles.push(...pageData);
        vPages++;
        vAfter = body.pagination?.hasNextPage ? body.pagination.endCursor : undefined;
      } while (vAfter);

      // 2. 获取司机
      const dRes = await fetch('https://api.samsara.com/fleet/drivers?limit=512&includeDeactivated=true', { headers });
      const drivers = dRes.ok ? (await dRes.json()).data : [];

      // 3. 获取实时分配 (filterBy=drivers 失败或为空则回退)
      const aRes = await fetch('https://api.samsara.com/fleet/driver-vehicle-assignments?filterBy=drivers', { headers });
      let assignments: any[] = [];
      let aStatusFinal = aRes.status;
      if (aRes.ok) {
        const result = await aRes.json();
        assignments = (result.data || []).filter((a: any) => !a.endTime);
      }
      if (assignments.length === 0) {
        const aRes2 = await fetch('https://api.samsara.com/fleet/driver-vehicle-assignments', { headers });
        aStatusFinal = aRes2.status;
        if (aRes2.ok) {
          const result2 = await aRes2.json();
          assignments = (result2.data || []).filter((a: any) => !a.endTime);
        }
      }

      // 4. 获取车辆实时状态 (stats API 限制每次最多 3 种 type)
      let vehicleStats: any[] = [];

      // 第一批：引擎/司机/转速
      const sRes1 = await fetch('https://api.samsara.com/fleet/vehicles/stats?types=engineStates,obdDriver,engineRpm', { headers });
      if (sRes1.ok) {
        vehicleStats = (await sRes1.json()).data || [];

        // 第二批：速度、燃油、GPS
        try {
          const sRes2 = await fetch('https://api.samsara.com/fleet/vehicles/stats?types=ecuSpeedMph,fuelPercents,gps', { headers });
          if (sRes2.ok) {
            const batch2Data = (await sRes2.json()).data || [];
            batch2Data.forEach((item: any) => {
              const existing = vehicleStats.find((v: any) => v.id === item.id);
              if (existing) {
                if (item.ecuSpeedMph) existing.ecuSpeedMph = item.ecuSpeedMph;
                if (item.fuelPercents) existing.fuelPercents = item.fuelPercents;
                if (item.gps) existing.gps = item.gps;
              }
            });
          }
        } catch {
          // 第二批失败不影响主流程
        }
      } else {
        console.error(`[Samsara] stats API 失败: ${sRes1.status}`);
        // 降级到单一类型
        const sRes3 = await fetch('https://api.samsara.com/fleet/vehicles/stats?types=engineStates', { headers });
        if (sRes3.ok) {
          vehicleStats = (await sRes3.json()).data || [];
        }
      }

      // 5. 获取位置信息
      const lRes = await fetch('https://api.samsara.com/fleet/vehicles/locations', { headers });
      const locations = lRes.ok ? (await lRes.json()).data : [];

      return {
        success: true,
        vehicles,
        drivers,
        assignments,
        vehicleStats,
        locations,
        debug: {
          vStatus,
          vPages,
          vCount: vehicles.length,
          aStatus: aStatusFinal,
          sStatus: sRes1.status,
          lStatus: lRes.status,
          statsCount: vehicleStats.length
        }
      };
    } catch (error: any) {
      console.error('[Samsara] 抓取失败:', error);
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
