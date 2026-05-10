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

      // 1. 获取车辆（带分页，防止 >512 时被截断）
      const vehicles: any[] = [];
      let vAfter: string | undefined;
      let vStatus = 0;
      let vPages = 0;
      do {
        // includeDeactivated=true 可以把 Samsara 后台停用的车也拉回来（便于排查"少一辆"问题）
        const url = `https://api.samsara.com/fleet/vehicles?limit=512&includeDeactivated=true${vAfter ? `&after=${encodeURIComponent(vAfter)}` : ''}`;
        const vRes = await fetch(url, { headers });
        vStatus = vRes.status;
        if (!vRes.ok) {
          const errText = await vRes.text();
          console.error(`❌ [Vehicles API] 第 ${vPages + 1} 页失败 (${vStatus}):`, errText);
          break;
        }
        const body = await vRes.json();
        const pageData = body.data || [];
        vehicles.push(...pageData);
        vPages++;
        console.log(`📄 [Vehicles API] 第 ${vPages} 页: ${pageData.length} 辆, hasNextPage=${body.pagination?.hasNextPage}`);
        vAfter = body.pagination?.hasNextPage ? body.pagination.endCursor : undefined;
      } while (vAfter);

      console.log(`📊 [Vehicles API] 共抓取 ${vehicles.length} 辆车（${vPages} 页）`);
      console.log(`📋 [Vehicles API] 车辆名单:`, vehicles.map((v: any) => `${v.name || '(无名)'} [${v.id}]`).join(', '));

      // 不再同步 assets（Samsara 所有车都在 vehicles 里）

      // 3. 获取司机
      const dRes = await fetch('https://api.samsara.com/fleet/drivers?limit=512&includeDeactivated=true', { headers });
      const drivers = dRes.ok ? (await dRes.json()).data : [];

      // 4. 获取实时分配
      // 先尝试带 filterBy=drivers（有些账号需要）；失败或空则回退到不带参数
      let aRes = await fetch('https://api.samsara.com/fleet/driver-vehicle-assignments?filterBy=drivers', { headers });
      let assignments: any[] = [];
      let aStatusFinal = aRes.status;
      if (aRes.ok) {
        const result = await aRes.json();
        assignments = (result.data || []).filter((a: any) => !a.endTime);
        console.log(`📌 [Assignments] filterBy=drivers 返回 ${assignments.length} 条`);
      } else {
        console.warn(`[Assignments API Error] filterBy=drivers 状态 ${aRes.status}`);
      }
      // 如果返回 0 条，尝试不带 filterBy 的调用作为回退
      if (assignments.length === 0) {
        console.log('🔁 [Assignments] 尝试不带 filterBy 的回退调用');
        const aRes2 = await fetch('https://api.samsara.com/fleet/driver-vehicle-assignments', { headers });
        aStatusFinal = aRes2.status;
        if (aRes2.ok) {
          const result2 = await aRes2.json();
          assignments = (result2.data || []).filter((a: any) => !a.endTime);
          console.log(`📌 [Assignments] 回退调用返回 ${assignments.length} 条`);
        } else {
          console.warn(`[Assignments Fallback Error] 状态 ${aRes2.status}`);
        }
      }

      // 5. 获取车辆实时状态
      console.log('🔄 获取车辆状态数据...');
      
      let vehicleStats = [];
      
      // 第一批：最关键的 3 个状态
      const batch1Types = 'engineStates,obdDriver,engineRpm';
      const sRes1 = await fetch(`https://api.samsara.com/fleet/vehicles/stats?types=${batch1Types}`, { headers });
      
      if (sRes1.ok) {
        const result1 = await sRes1.json();
        vehicleStats = result1.data || [];
        console.log(`✅ 获取到 ${vehicleStats.length} 个车辆状态`);
        
        // 第二批：速度、燃油、GPS
        try {
          const batch2Types = 'ecuSpeedMph,fuelPercents,gps';
          const sRes2 = await fetch(`https://api.samsara.com/fleet/vehicles/stats?types=${batch2Types}`, { headers });
          
          if (sRes2.ok) {
            const result2 = await sRes2.json();
            const batch2Data = result2.data || [];
            
            // 合并数据
            batch2Data.forEach((item: any) => {
              const existing = vehicleStats.find((v: any) => v.id === item.id);
              if (existing) {
                if (item.ecuSpeedMph) existing.ecuSpeedMph = item.ecuSpeedMph;
                if (item.fuelPercents) existing.fuelPercents = item.fuelPercents;
                if (item.gps) existing.gps = item.gps;
              }
            });
          }
        } catch (e) {
          console.warn('⚠️ 获取额外状态失败', e);
        }
        
      } else {
        const errorText = await sRes1.text();
        console.error(`❌ Stats API 失败: ${sRes1.status}`, errorText);
        
        // 降级到单一类型
        const sRes3 = await fetch('https://api.samsara.com/fleet/vehicles/stats?types=engineStates', { headers });
        if (sRes3.ok) {
          const result3 = await sRes3.json();
          vehicleStats = result3.data || [];
          console.log(`✅ 简化调用: ${vehicleStats.length} 个车辆`);
        }
      }

      // 6. 获取位置信息 ( locations 接口通常很稳)
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
