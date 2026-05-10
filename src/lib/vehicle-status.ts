/**
 * 车辆状态判断工具
 * 基于 Samsara Vehicle Stats API
 */

export interface VehicleStatus {
  id: string;
  name?: string;
  isActive: boolean;
  engineState: 'Off' | 'On' | 'Idle' | 'Unknown';
  rpm?: number;
  speed?: number;
  fuelPercent?: number;
  hasDriver: boolean;
  driverName?: string;
  lastUpdate?: string;
}

/**
 * 从 Samsara Stats 数据中提取车辆状态
 * 
 * ⚠️ 关键逻辑说明：
 * Samsara 的 engineState.time 表示"状态最后变更"的时刻，不是"最后心跳"。
 * 一辆 13:00 启动、16:00 还在跑的车，engineState=On 但 time 仍是 13:00。
 * 所以判断"是否活跃"要用 **所有信号中最新的 time** 来对比 1 小时窗口。
 */
export function extractVehicleStatus(stat: any): VehicleStatus {
  const status: VehicleStatus = {
    id: stat.id,
    name: stat.name,
    isActive: false,
    engineState: 'Unknown',
    hasDriver: false,
  };

  // 收集所有可用时间戳，取最新的作为"最后心跳"
  const timestamps: number[] = [];
  const pushTime = (t?: string) => {
    if (!t) return;
    const ms = new Date(t).getTime();
    if (!isNaN(ms)) timestamps.push(ms);
  };
  pushTime(stat.engineState?.time);
  pushTime(stat.engineRpm?.time);
  pushTime(stat.ecuSpeedMph?.time);
  pushTime(stat.fuelPercents?.time);
  pushTime(stat.gps?.time);
  pushTime(stat.obdDriver?.time);

  const latestMs = timestamps.length ? Math.max(...timestamps) : 0;
  const nowMs = Date.now();
  const oneHourInMs = 60 * 60 * 1000;
  const freshlySeen = latestMs > 0 && (nowMs - latestMs) <= oneHourInMs;

  // 1. 引擎状态
  if (stat.engineState && stat.engineState.value) {
    status.engineState = stat.engineState.value || 'Unknown';
    status.lastUpdate = stat.engineState.time;

    // 引擎 On/Idle + 任意心跳在 1 小时内 → 活跃
    if ((status.engineState === 'On' || status.engineState === 'Idle') && freshlySeen) {
      status.isActive = true;
    }
  }

  // 2. 检查发动机转速 (engineRpm)
  if (stat.engineRpm && typeof stat.engineRpm === 'object' && stat.engineRpm.value !== undefined) {
    status.rpm = stat.engineRpm.value || 0;
    
    if (status.rpm > 0) {
      if (status.engineState === 'Unknown') {
        status.engineState = status.rpm > 1000 ? 'On' : 'Idle';
      }
      // 只有在 1 小时内才算活跃
      if (stat.engineRpm.time) {
        const updateTime = new Date(stat.engineRpm.time).getTime();
        const now = Date.now();
        if (now - updateTime <= 60 * 60 * 1000) {
          status.isActive = true;
        }
      }
    }
  }

  // 3. 检查车速 (ecuSpeedMph)
  if (stat.ecuSpeedMph && typeof stat.ecuSpeedMph === 'object' && stat.ecuSpeedMph.value !== undefined) {
    status.speed = stat.ecuSpeedMph.value || 0;
    
    if (status.speed > 0) {
      if (status.engineState === 'Unknown' || status.engineState === 'Idle') {
        status.engineState = 'On';
      }
      // 只有在 1 小时内才算活跃
      if (stat.ecuSpeedMph.time) {
        const updateTime = new Date(stat.ecuSpeedMph.time).getTime();
        const now = Date.now();
        if (now - updateTime <= 60 * 60 * 1000) {
          status.isActive = true;
        }
      }
    }
  }

  // 4. 检查燃油百分比 (fuelPercents)
  if (stat.fuelPercents && typeof stat.fuelPercents === 'object' && stat.fuelPercents.value !== undefined) {
    status.fuelPercent = stat.fuelPercents.value || 0;
  }

  // 5. 检查是否有活跃的 OBD 司机
  if (stat.obdDriver && stat.obdDriver.driver) {
    status.hasDriver = true;
    status.driverName = stat.obdDriver.driver.name;
    // 有司机信息就算活跃
    status.isActive = true;
  }

  return status;
}

/**
 * 批量处理车辆状态
 */
export function extractAllVehicleStatuses(stats: any[]): Map<string, VehicleStatus> {
  const statusMap = new Map<string, VehicleStatus>();
  
  stats.forEach(stat => {
    const status = extractVehicleStatus(stat);
    statusMap.set(status.id, status);
  });
  
  return statusMap;
}

/**
 * 获取活跃车辆的 ID 集合
 */
export function getActiveVehicleIds(stats: any[]): Set<string> {
  const activeIds = new Set<string>();
  
  stats.forEach(stat => {
    const status = extractVehicleStatus(stat);
    if (status.isActive) {
      activeIds.add(status.id);
    }
  });
  
  return activeIds;
}

/**
 * 格式化车辆状态用于显示
 */
export function formatVehicleStatus(status: VehicleStatus): string {
  const parts: string[] = [];
  
  parts.push(`状态: ${status.engineState}`);
  
  if (status.rpm !== undefined && status.rpm > 0) {
    parts.push(`${status.rpm} RPM`);
  }
  
  if (status.speed !== undefined && status.speed > 0) {
    parts.push(`${status.speed.toFixed(1)} mph`);
  }
  
  if (status.fuelPercent !== undefined) {
    parts.push(`燃油: ${status.fuelPercent.toFixed(0)}%`);
  }
  
  if (status.hasDriver && status.driverName) {
    parts.push(`司机: ${status.driverName}`);
  }
  
  return parts.join(' | ');
}
