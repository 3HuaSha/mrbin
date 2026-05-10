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

      // 5. 获取车辆实时状态
      // 重要：Samsara API 的 types 参数是必需的，且最多支持 3 个类型
      // 我们分批次调用来获取所有需要的数据
      
      console.log('🔄 开始获取车辆状态数据...');
      
      let vehicleStats = [];
      
      // 第一批：最关键的 3 个状态（引擎状态、司机、转速）
      const batch1Types = 'engineStates,obdDriver,engineRpm';
      console.log(`📡 批次 1: ${batch1Types}`);
      
      const sRes1 = await fetch(`https://api.samsara.com/fleet/vehicles/stats?types=${batch1Types}`, { headers });
      
      if (sRes1.ok) {
        const result1 = await sRes1.json();
        vehicleStats = result1.data || [];
        console.log(`✅ 批次 1 成功: 获取 ${vehicleStats.length} 个车辆数据`);
        
        if (vehicleStats.length > 0) {
          const first = vehicleStats[0];
          console.log(`📊 示例车辆完整数据:`, JSON.stringify(first, null, 2));
          console.log(`  - ID: ${first.id}`);
          console.log(`  - Name: ${first.name}`);
          console.log(`  - 所有字段: ${Object.keys(first).join(', ')}`);
          console.log(`  - engineStates: ${first.engineStates ? first.engineStates.length + ' 条' : '无'}`);
          console.log(`  - obdDriver: ${first.obdDriver ? '有' : '无'}`);
          console.log(`  - engineRpm: ${first.engineRpm ? first.engineRpm.length + ' 条' : '无'}`);
        }
        
        // 第二批：速度、燃油、GPS
        try {
          const batch2Types = 'ecuSpeedMph,fuelPercents,gps';
          console.log(`📡 批次 2: ${batch2Types}`);
          
          const sRes2 = await fetch(`https://api.samsara.com/fleet/vehicles/stats?types=${batch2Types}`, { headers });
          
          if (sRes2.ok) {
            const result2 = await sRes2.json();
            const batch2Data = result2.data || [];
            
            // 合并数据到第一批
            batch2Data.forEach((item: any) => {
              const existing = vehicleStats.find((v: any) => v.id === item.id);
              if (existing) {
                if (item.ecuSpeedMph) existing.ecuSpeedMph = item.ecuSpeedMph;
                if (item.fuelPercents) existing.fuelPercents = item.fuelPercents;
                if (item.gps) existing.gps = item.gps;
              }
            });
            
            console.log(`✅ 批次 2 成功: 合并额外数据`);
          } else {
            console.warn(`⚠️ 批次 2 失败: ${sRes2.status}`);
          }
        } catch (e) {
          console.warn('⚠️ 批次 2 出错，继续使用批次 1 数据', e);
        }
        
      } else {
        const errorText = await sRes1.text();
        console.error(`❌ Stats API 失败: ${sRes1.status}`);
        console.error(`错误详情: ${errorText}`);
        
        // 如果第一批失败，尝试最简单的单一类型调用
        console.log('🔄 尝试最简单的调用: types=engineStates');
        const sRes3 = await fetch('https://api.samsara.com/fleet/vehicles/stats?types=engineStates', { headers });
        
        if (sRes3.ok) {
          const result3 = await sRes3.json();
          vehicleStats = result3.data || [];
          console.log(`✅ 简化调用成功: ${vehicleStats.length} 个车辆`);
        } else {
          const errorText3 = await sRes3.text();
          console.error(`❌ 简化调用也失败: ${sRes3.status}`);
          console.error(`错误详情: ${errorText3}`);
        }
      }
      
      console.log(`📊 最终获取到 ${vehicleStats.length} 个车辆的状态数据`);

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
