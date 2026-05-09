import { createServerFn } from "@tanstack/react-start";

/**
 * 获取 Samsara 原始数据
 */
export const fetchSamsaraData = createServerFn({ method: "GET" })
  .handler(async () => {
    const SAMSARA_TOKEN = (process.env.VITE_SAMSARA_TOKEN || 'samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke') as string;

    try {
      // 1. 获取车辆
      let vehicles: any[] = [];
      const vRes = await fetch('https://api.samsara.com/fleet/vehicles?limit=512', {
        headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
      });
      if (vRes.ok) {
        const result = await vRes.json();
        vehicles = result.data || [];
      }

      // 2. 获取司机 (包含当前车辆信息)
      let drivers: any[] = [];
      const dRes = await fetch('https://api.samsara.com/fleet/drivers?limit=512&includeDeactivated=true', {
        headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
      });
      if (dRes.ok) {
        const result = await dRes.json();
        drivers = result.data || [];
      }

      // 3. 获取车辆实时状态 (用于补充司机信息)
      let vehicleStats: any[] = [];
      const sRes = await fetch('https://api.samsara.com/fleet/vehicles/stats?types=obdDriver', {
        headers: { 'Authorization': `Bearer ${SAMSARA_TOKEN}`, 'Accept': 'application/json' }
      });
      if (sRes.ok) {
        const result = await sRes.json();
        vehicleStats = result.data || [];
      }

      return {
        success: true,
        vehicles,
        drivers,
        vehicleStats,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
