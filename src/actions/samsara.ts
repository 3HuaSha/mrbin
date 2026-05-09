import { createServerFn } from "@tanstack/react-start";

/**
 * 获取 Samsara 原始数据
 */
export const fetchSamsaraData = createServerFn({ method: "GET" })
  .handler(async () => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;
    try {
      let vehicles: any[] = [];
      const vRes = await fetch('https://api.samsara.com/fleet/vehicles?limit=512', {
        headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
      });
      if (vRes.ok) {
        const result = await vRes.json();
        vehicles = result.data || [];
      }
      let drivers: any[] = [];
      const dRes = await fetch('https://api.samsara.com/fleet/drivers?limit=512&includeDeactivated=true', {
        headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
      });
      if (dRes.ok) {
        const result = await dRes.json();
        drivers = result.data || [];
      }
      let vehicleStats: any[] = [];
      const sRes = await fetch('https://api.samsara.com/fleet/vehicles/stats?types=obdDriver', {
        headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
      });
      if (sRes.ok) {
        const result = await sRes.json();
        vehicleStats = result.data || [];
      }
      return { success: true, vehicles, drivers, vehicleStats, timestamp: new Date().toISOString() };
    } catch (error: any) {
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
      console.error('❌ ETA 计算异常:', error);
      return { success: false, error: error.message || 'Unknown error', legs: [], totalDistance: 0, totalDuration: 0 };
    }
  });
