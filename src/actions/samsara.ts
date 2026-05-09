import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * 获取 Samsara 原始数据 (用于前端查询或进一步同步)
 */
export const fetchSamsaraData = createServerFn({ method: "GET" })
  .handler(async () => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || process.env.SAMSARA_API_KEY || import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;

    try {
      let allUnits: any[] = [];
      let counts = { vehicles: 0, trailers: 0, equipment: 0 };
      
      // 1. 获取所有单位数据
      const endpoints = [
        { key: 'vehicles', url: 'https://api.samsara.com/fleet/vehicles?limit=512', name: 'Vehicles' },
        { key: 'trailers', url: 'https://api.samsara.com/fleet/trailers?limit=512', name: 'Trailers' },
        { key: 'equipment', url: 'https://api.samsara.com/fleet/equipment?limit=512', name: 'Equipment' },
        { key: 'assets', url: 'https://api.samsara.com/assets?limit=512', name: 'Assets (Unified)' },
      ];

      for (const ep of endpoints) {
        let hasNextPage = true;
        let after = '';
        while (hasNextPage) {
          const url = `${ep.url}${after ? `&after=${after}` : ''}`;
          try {
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' } });
            if (!response.ok) break;
            const result = await response.json();
            const data = result.data || [];
            allUnits = [...allUnits, ...data];
            if (ep.key === 'vehicles') counts.vehicles += data.length;
            else if (ep.key === 'trailers') counts.trailers += data.length;
            else counts.equipment += data.length;
            hasNextPage = result.pagination?.hasNextPage || false;
            after = result.pagination?.endCursor || '';
          } catch (err) { break; }
        }
      }

      // 2. 获取所有位置信息
      let allLocations: any[] = [];
      const locEndpoints = [
        'https://api.samsara.com/fleet/vehicles/locations?limit=512',
        'https://api.samsara.com/fleet/trailers/locations?limit=512',
        'https://api.samsara.com/fleet/equipment/locations?limit=512',
        'https://api.samsara.com/assets/locations?limit=512'
      ];
      for (const endpoint of locEndpoints) {
        let hasNextPage = true;
        let after = '';
        while (hasNextPage) {
          try {
            const response = await fetch(`${endpoint}${after ? `&after=${after}` : ''}`, { headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' } });
            if (!response.ok) break;
            const result = await response.json();
            allLocations = [...allLocations, ...(result.data || [])];
            hasNextPage = result.pagination?.hasNextPage || false;
            after = result.pagination?.endCursor || '';
          } catch (err) { break; }
        }
      }

      // 3. 获取所有司机信息 (包含停用的)
      let allDrivers: any[] = [];
      try {
        let hasNextPage = true;
        let after = '';
        while (hasNextPage) {
          const response = await fetch(`https://api.samsara.com/fleet/drivers?limit=512&includeDeactivated=true${after ? `&after=${after}` : ''}`, { headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' } });
          if (!response.ok) break;
          const result = await response.json();
          allDrivers = [...allDrivers, ...(result.data || [])];
          hasNextPage = result.pagination?.hasNextPage || false;
          after = result.pagination?.endCursor || '';
        }
      } catch (err) {}

      // 4. 获取当前活跃分配关系 (合并多端点)
      let allAssignments: any[] = [];
      try {
        const assignEndpoints = [
          'https://api.samsara.com/fleet/driver-vehicle-assignments?filterBy=drivers',
          'https://api.samsara.com/fleet/driver-vehicle-assignments?filterBy=vehicles'
        ];
        for (const url of assignEndpoints) {
          const response = await fetch(url, { headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' } });
          if (response.ok) {
            const result = await response.json();
            const active = (result.data || []).filter((a: any) => !a.endTime);
            allAssignments = [...allAssignments, ...active];
          }
        }
        // 增加 OBD 实时状态
        const statsRes = await fetch(`https://api.samsara.com/fleet/vehicles/stats?types=obdDriver`, { headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' } });
        if (statsRes.ok) {
          const statsResult = await statsRes.json();
          (statsResult.data || []).forEach((stat: any) => {
            if (stat.obdDriver?.driver?.id) {
              allAssignments.push({ driver: { id: stat.obdDriver.driver.id, name: stat.obdDriver.driver.name }, vehicle: { id: stat.id, name: stat.name }, isRealtime: true });
            }
          });
        }
      } catch (err) {}

      // 5. 数据处理与合并
      const uniqueUnitsMap = new Map();
      allUnits.forEach(u => { if (u?.id) { if (!uniqueUnitsMap.has(u.id) || (!uniqueUnitsMap.get(u.id).name && u.name)) uniqueUnitsMap.set(u.id, u); } });
      const locationMap = new Map();
      allLocations.forEach(loc => { if (loc?.id) locationMap.set(loc.id, loc); });

      const mergedData = Array.from(uniqueUnitsMap.values()).map(v => {
        const locInfo = locationMap.get(v.id);
        const name = v.name || v.trailerName || v.machineName || v.externalIds?.vin || `Unit-${v.id.substring(0, 5)}`;
        return { id: v.id, name, location: locInfo?.location || null, time: locInfo?.time || null };
      });

      return { success: true, data: mergedData, drivers: allDrivers, samsaraAssignments: allAssignments, summary: { ...counts, drivers: allDrivers.length }, timestamp: new Date().toISOString() };
    } catch (error: any) {
      console.error('❌ Samsara API 异常:', error);
      return { success: false, error: error.message || 'Unknown error', data: [], drivers: [], samsaraAssignments: [] };
    }
  });

/**
 * 全量同步 Samsara 数据到数据库 (服务端执行)
 */
export const syncSamsaraAction = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      console.log('🚀 开始全量同步 Samsara 数据到数据库...');
      
      const result = await fetchSamsaraData();
      if (!result.success) throw new Error(result.error || '获取数据失败');
      
      const samsaraVehicles = result.data || [];
      const samsaraDrivers = (result as any).drivers || [];
      const samsaraAssignmentsRaw = (result as any).samsaraAssignments || [];

      // 1. 同步车辆 (清理并插入)
      await supabaseAdmin.from("job_steps").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      await supabaseAdmin.from("dispatch_assignments").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      await supabaseAdmin.from("vehicles").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);

      const uniqueVehicles = new Map();
      samsaraVehicles.forEach((v: any) => {
        if (!v.name) return;
        const plate = v.name.toUpperCase();
        if (!uniqueVehicles.has(plate)) {
          const upperName = v.name.toUpperCase();
          let type: "HINO" | "MACK" = "MACK";
          let maxBinSize = "40";
          if (upperName.includes("HINO") || upperName.startsWith("BIN")) { type = "HINO"; maxBinSize = "20"; }
          else if (upperName.includes("FLAT") || upperName.includes("DUMP") || upperName.includes("MACK")) { type = "MACK"; maxBinSize = "40"; }
          uniqueVehicles.set(plate, { name: v.name, type, plate, samsara_id: v.id, max_bin_size: maxBinSize, is_active: true });
        }
      });

      const { data: insertedVehicles, error: vError } = await supabaseAdmin.from("vehicles").insert(Array.from(uniqueVehicles.values())).select();
      if (vError) throw vError;
      const allVehicles = insertedVehicles || [];

      // 2. 同步司机 (Upsert)
      const driverSamsaraIdToInternalId = new Map<string, string>();
      const driverNameToInternalId = new Map<string, string>();
      let driversAdded = 0;
      let driversUpdated = 0;

      for (const sd of samsaraDrivers) {
        if (!sd.name) continue;
        const { data: existing } = await supabaseAdmin.from("profiles").select("id").eq("name", sd.name).eq("role", "driver");
        let dId = '';
        if (existing && existing.length > 0) {
          dId = existing[0].id;
          await supabaseAdmin.from("profiles").update({ phone: sd.phone || null, email: sd.email || null, is_active: true }).eq("id", dId);
          driversUpdated++;
        } else {
          const { data: nw, error: nE } = await supabaseAdmin.from("profiles").insert({ name: sd.name, phone: sd.phone || null, email: sd.email || null, role: "driver", is_active: true }).select().single();
          if (nE) continue;
          dId = nw.id;
          driversAdded++;
        }
        driverSamsaraIdToInternalId.set(sd.id, dId);
        driverNameToInternalId.set(sd.name.toUpperCase(), dId);
      }

      // 3. 处理分配关系 (清理并根据优先级插入)
      await supabaseAdmin.from("driver_vehicle_assignments").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      const pending = new Map<string, string>();

      // 优先级 A: 静态/当前状态
      for (const sd of samsaraDrivers) {
        const dId = driverSamsaraIdToInternalId.get(sd.id);
        const vRef = sd.staticAssignedVehicle || sd.currentVehicle;
        if (dId && vRef?.id) {
          const v = allVehicles.find(veh => veh.samsara_id === vRef.id);
          if (v) pending.set(dId, v.id);
        }
      }

      // 优先级 B: 分配接口与 OBD (覆盖静态)
      for (const sa of samsaraAssignmentsRaw) {
        let dId = driverSamsaraIdToInternalId.get(sa.driver?.id);
        if (!dId && sa.driver?.name) dId = driverNameToInternalId.get(sa.driver.name.toUpperCase());
        if (!dId) continue;
        let v = allVehicles.find(veh => veh.samsara_id === sa.vehicle?.id);
        if (!v && sa.vehicle?.name) {
          const target = sa.vehicle.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
          v = allVehicles.find(veh => veh.name.toUpperCase().replace(/[^A-Z0-9]/g, '') === target);
        }
        if (v) pending.set(dId, v.id);
      }

      const finalInserts = Array.from(pending.entries()).map(([dId, vId]) => ({ driver_id: dId, vehicle_id: vId }));
      if (finalInserts.length > 0) await supabaseAdmin.from("driver_vehicle_assignments").insert(finalInserts);

      return { success: true, summary: { vehicles: allVehicles.length, driversAdded, driversUpdated, assignments: finalInserts.length } };
    } catch (err: any) {
      console.error('❌ syncSamsaraAction 失败:', err);
      return { success: false, error: err.message };
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
      console.error('❌ ETA 计算异常:', error);
      return { success: false, error: error.message || 'Unknown error', legs: [], totalDistance: 0, totalDuration: 0 };
    }
  });
