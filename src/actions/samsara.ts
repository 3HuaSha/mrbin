import { createServerFn } from "@tanstack/react-start";

export const fetchSamsaraData = createServerFn({ method: "GET" })
  .handler(async () => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || process.env.SAMSARA_API_KEY || import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;
    
    console.log('🔄 Server Function: 开始全量同步 Samsara 数据 (Vehicles, Trailers, Equipment)');

    try {
      let allUnits: any[] = [];
      let counts = { vehicles: 0, trailers: 0, equipment: 0 };
      
      // -- 1-4. 获取所有单位数据 (多维度尝试以确保不漏掉 FLAT 等资产) --
      const endpoints = [
        { key: 'vehicles', url: 'https://api.samsara.com/fleet/vehicles', name: 'Vehicles' },
        { key: 'trailers', url: 'https://api.samsara.com/fleet/trailers', name: 'Trailers' },
        { key: 'equipment', url: 'https://api.samsara.com/fleet/equipment', name: 'Equipment' },
        { key: 'assets', url: 'https://api.samsara.com/assets', name: 'Assets (Unified)' },
        { key: 'v1_assets', url: 'https://api.samsara.com/v1/fleet/assets', name: 'V1 Assets' },
        { key: 'machines', url: 'https://api.samsara.com/fleet/machines', name: 'Machines' }
      ];

      for (const ep of endpoints) {
        let hasNextPage = true;
        let after = '';
        let pageNum = 0;
        console.log(`\n🔍 开始获取 [${ep.name}] 数据...`);
        
        while (hasNextPage) {
          pageNum++;
          const url = `${ep.url}${after ? (ep.url.includes('?') ? `&after=${after}` : `?after=${after}`) : ''}`;
          console.log(`  📄 [${ep.name}] 第 ${pageNum} 页: ${url}`);
          
          try {
            const response = await fetch(url, {
              headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
            });
            
            if (!response.ok) {
              const errorText = await response.text();
              console.warn(`⚠️ Samsara API [${ep.name}] 响应异常: ${response.status} ${response.statusText}`);
              console.warn(`  错误详情: ${errorText}`);
              break;
            }
            
            const result = await response.json();
            const data = result.data || [];
            
            // 详细记录每个单位的名称
            console.log(`  ✅ [${ep.name}] 第 ${pageNum} 页获取到 ${data.length} 个单位:`);
            data.forEach((unit: any, idx: number) => {
              const name = unit.name || unit.trailerName || unit.machineName || unit.externalIds?.vin || `Unit-${unit.id?.substring(0, 5)}`;
              console.log(`    ${idx + 1}. ${name} (ID: ${unit.id?.substring(0, 8)}...)`);
            });
            
            allUnits = [...allUnits, ...data];
            
            // 更新统计
            if (ep.key === 'vehicles') counts.vehicles += data.length;
            else if (ep.key === 'trailers') counts.trailers += data.length;
            else counts.equipment += data.length;

            hasNextPage = result.pagination?.hasNextPage || false;
            after = result.pagination?.endCursor || '';
            
            console.log(`  📊 [${ep.name}] 分页信息: hasNextPage=${hasNextPage}, endCursor=${after ? after.substring(0, 20) + '...' : 'null'}`);
            
            if (!hasNextPage) {
              console.log(`  ✅ [${ep.name}] 数据获取完成，共 ${pageNum} 页\n`);
            }
          } catch (err) {
            console.error(`❌ 获取 [${ep.name}] 第 ${pageNum} 页失败:`, err);
            break;
          }
        }
      }

      // -- 5. 获取所有位置信息 --
      let allLocations: any[] = [];
      const locationEndpoints = [
        'https://api.samsara.com/fleet/vehicles/locations',
        'https://api.samsara.com/fleet/trailers/locations',
        'https://api.samsara.com/fleet/equipment/locations',
        'https://api.samsara.com/assets/locations'
      ];

      for (const endpoint of locationEndpoints) {
        let hasNextPage = true;
        let after = '';
        while (hasNextPage) {
          const url = `${endpoint}${after ? `?after=${after}` : ''}`;
          const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
          });
          if (!response.ok) break;
          const result = await response.json();
          allLocations = [...allLocations, ...(result.data || [])];
          hasNextPage = result.pagination?.hasNextPage || false;
          after = result.pagination?.endCursor || '';
        }
      }

      // -- 6. 合并数据并去重 --
      console.log(`\n📊 开始合并和去重数据...`);
      console.log(`  原始单位总数: ${allUnits.length}`);
      
      const uniqueUnitsMap = new Map();
      allUnits.forEach(u => {
        if (u && u.id) {
          const name = u.name || u.trailerName || u.machineName || u.externalIds?.vin || `Unit-${u.id.substring(0, 5)}`;
          // 如果已存在且没有名称，则尝试用新的覆盖（以防某些接口返回的信息不全）
          if (!uniqueUnitsMap.has(u.id)) {
            uniqueUnitsMap.set(u.id, u);
            console.log(`  ➕ 新增单位: ${name} (ID: ${u.id.substring(0, 8)}...)`);
          } else if (!uniqueUnitsMap.get(u.id).name && u.name) {
            console.log(`  🔄 更新单位名称: ${name} (ID: ${u.id.substring(0, 8)}...)`);
            uniqueUnitsMap.set(u.id, u);
          } else {
            console.log(`  ⏭️  跳过重复单位: ${name} (ID: ${u.id.substring(0, 8)}...)`);
          }
        }
      });
      
      console.log(`  去重后单位总数: ${uniqueUnitsMap.size}\n`);

      const locationMap = new Map();
      allLocations.forEach(loc => {
        if (loc && loc.id) {
          locationMap.set(loc.id, loc);
        }
      });

      const mergedData = Array.from(uniqueUnitsMap.values()).map(v => {
        const locInfo = locationMap.get(v.id);
        // 确保名称不为空，依次尝试 name, trailerName, machineName, externalIds
        const name = v.name || v.trailerName || v.machineName || v.externalIds?.vin || `Unit-${v.id.substring(0, 5)}`;
        return {
          id: v.id,
          name: name,
          location: locInfo?.location || null,
          time: locInfo?.time || null
        };
      });
      
      console.log(`\n📋 最终合并数据列表 (${mergedData.length} 个单位):`);
      mergedData.forEach((unit, idx) => {
        console.log(`  ${idx + 1}. ${unit.name} (ID: ${unit.id.substring(0, 8)}..., 位置: ${unit.location ? '有' : '无'})`);
      });

      console.log(`\n✅ 同步完成: Vehicles(${counts.vehicles}), Trailers(${counts.trailers}), Equipment/Assets(${counts.equipment}), Total Unique(${uniqueUnitsMap.size})`);

      return {
        success: true,
        data: mergedData,
        summary: counts,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('❌ Samsara API 异常:', error);
      return { success: false, error: error.message || 'Unknown error', data: [] };
    }
  });



// ==========================================
// 简单的内存缓存机制（节省 Google Maps API 费用）
// ==========================================
const geocodeCache = new Map<string, { lat: number; lng: number }>();
const routesCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟缓存过期时间

/**
 * 使用 Samsara Routes API 计算路线和 ETA
 * 需要 API Token 具有 Routes write permissions
 * 
 * 配置说明：请参考 SAMSARA_API_PERMISSIONS_SETUP.md
 */
export const calculateSamsaraRouteForVehicle = createServerFn({ method: "POST" })
  .inputValidator((data: {
    vehicleId: string;
    destinations: Array<{ address: string; name: string; latitude?: number; longitude?: number }>;
  }) => data)
  .handler(async ({ data }) => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || process.env.SAMSARA_API_KEY || import.meta.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;
    const GOOGLE_MAPS_API_KEY = (process.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_GOOGLE_MAPS_API_KEY) as string;

    console.log('🔄 Server Function: 计算车辆路线，车辆ID:', data.vehicleId, '目的地数量:', data.destinations.length);

    try {
      // ==========================================
      // 使用最新的 Google Maps Routes API (V2) 进行 ETA 计算
      // ==========================================
      if (!GOOGLE_MAPS_API_KEY) {
         throw new Error('缺少 Google Maps API Key，无法计算真实 ETA。');
      }

      // 组装 Waypoint 对象（如果是坐标则使用 latLng，如果是地址则直接使用 address）
      const createWaypoint = (dest: any) => {
        if (dest.latitude && dest.longitude) {
          return {
            location: {
              latLng: {
                latitude: dest.latitude,
                longitude: dest.longitude
              }
            }
          };
        } else {
          return { address: dest.address };
        }
      };

      const origin = createWaypoint(data.destinations[0]);
      const destination = createWaypoint(data.destinations[data.destinations.length - 1]);
      const intermediates = data.destinations.slice(1, data.destinations.length - 1).map(createWaypoint);

      const requestBody = {
        origin,
        destination,
        intermediates,
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE', // 修改为 TRAFFIC_UNAWARE 避免高级版收费
      };

      // 生成缓存 Key（对经纬度精确到小数点后3位，约100米，对地址直接使用字符串）
      const cacheKey = data.vehicleId + '_' + data.destinations.map(d => 
        d.latitude ? `${Math.round(d.latitude * 1000)},${Math.round(d.longitude! * 1000)}` : d.address
      ).join('|');

      const nowTime = Date.now();
      if (routesCache.has(cacheKey)) {
        const cached = routesCache.get(cacheKey)!;
        if (nowTime - cached.timestamp < CACHE_TTL_MS) {
          console.log('⚡ 使用缓存的 ETA 路线数据');
          return cached.data;
        } else {
          routesCache.delete(cacheKey);
        }
      }

      console.log('🔄 调用最新 Google Maps Routes API (v2) 计算 ETA...');
      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          // 指定我们只需要返回距离和时长字段，以节省流量和提高速度
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration'
        },
        body: JSON.stringify(requestBody)
      });

      const responseData = await response.json();

      if (!response.ok || responseData.error) {
        console.error('❌ Google Maps Routes API 错误:', responseData.error || responseData);
        return {
          success: false,
          error: `Google Maps Routes 计算失败: ${responseData.error?.message || response.status}`,
          legs: [],
          totalDistance: 0,
          totalDuration: 0,
        };
      }

      console.log('✅ Google Maps Routes 计算成功');

      const legs: Array<{ distance: number; duration: number }> = [];
      let totalDistance = 0;
      let totalDuration = 0;

      const route = responseData.routes?.[0];
      if (route && route.legs) {
        for (const leg of route.legs) {
          const distance = leg.distanceMeters || 0; 
          // duration 返回格式如 "1845s"，需要去掉 's' 并转为数字
          const duration = parseInt((leg.duration || '0s').replace('s', ''), 10); 
          
          legs.push({ distance, duration });
          totalDistance += distance;
          totalDuration += duration;
        }
      }

      const result = {
        success: true,
        legs,
        totalDistance,
        totalDuration,
        error: null as string | null,
      };

      // 存入缓存
      routesCache.set(cacheKey, { data: result, timestamp: nowTime });

      console.log('📤 返回结果:', { legsCount: legs.length, totalDistance, totalDuration });
      return result;

    } catch (error: any) {
      console.error('❌ ETA 计算异常:', error);

      return {
        success: false,
        error: error.message || 'Unknown error',
        legs: [],
        totalDistance: 0,
        totalDuration: 0,
      };
    }
  });

