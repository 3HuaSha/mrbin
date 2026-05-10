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

      // 5. 获取车辆实时状态 - 使用更全面的 stats 类型
      // 包括引擎状态、OBD司机、燃油、速度、里程等
      const statsTypes = [
        'engineStates',      // 引擎状态 (Off, On, Idle)
        'obdDriver',         // OBD 司机信息
        'fuelPercents',      // 燃油百分比
        'ecuSpeedMph',       // ECU 速度
        'obdOdometerMeters', // 里程表
        'engineRpm',         // 发动机转速
        'gps'                // GPS 位置
      ].join(',');
      
      console.log(`🔄 请求 Stats API: types=${statsTypes}`);
      
      const sRes = await fetch(`https://api.samsara.com/fleet/vehicles/stats?types=${statsTypes}`, { headers });
      let vehicleStats = [];
      if (sRes.ok) {
        const result = await sRes.json();
        vehicleStats = result.data || [];
        console.log(`✅ 获取到 ${vehicleStats.length} 个车辆的实时状态`);
        
        // 调试：显示第一个车辆的完整数据结构
        if (vehicleStats.length > 0) {
          console.log('📊 第一个车辆的数据结构示例:');
          console.log('  ID:', vehicleStats[0].id);
          console.log('  Name:', vehicleStats[0].name);
          console.log('  可用的数据字段:', Object.keys(vehicleStats[0]));
          
          // 检查每个状态类型是否有数据
          const firstVehicle = vehicleStats[0];
          console.log('  数据详情:');
          console.log('    - engineStates:', firstVehicle.engineStates ? `有 ${firstVehicle.engineStates.length} 条` : '无');
          console.log('    - engineRpm:', firstVehicle.engineRpm ? `有 ${firstVehicle.engineRpm.length} 条` : '无');
          console.log('    - ecuSpeedMph:', firstVehicle.ecuSpeedMph ? `有 ${firstVehicle.ecuSpeedMph.length} 条` : '无');
          console.log('    - fuelPercents:', firstVehicle.fuelPercents ? `有 ${firstVehicle.fuelPercents.length} 条` : '无');
          console.log('    - obdDriver:', firstVehicle.obdDriver ? '有' : '无');
          console.log('    - obdOdometerMeters:', firstVehicle.obdOdometerMeters ? `有 ${firstVehicle.obdOdometerMeters.length} 条` : '无');
          console.log('    - gps:', firstVehicle.gps ? `有 ${firstVehicle.gps.length} 条` : '无');
        }
      } else {
        const errorText = await sRes.text();
        console.warn(`[Stats API Error] Status: ${sRes.status}, Response: ${errorText}`);
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
