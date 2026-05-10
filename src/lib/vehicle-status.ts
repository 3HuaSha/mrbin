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
 */
export function extractVehicleStatus(stat: any): VehicleStatus {
  const status: VehicleStatus = {
    id: stat.id,
    name: stat.name,
    isActive: false,
    engineState: 'Unknown',
    hasDriver: false,
  };

  // 1. 检查引擎状态 (engineStates)
  if (stat.engineStates && Array.isArray(stat.engineStates) && stat.engineStates.length > 0) {
    const latestState = stat.engineStates[stat.engineStates.length - 1];
    status.engineState = latestState?.value || 'Unknown';
    status.lastUpdate = latestState?.time;
    
    // 引擎状态：Off（关闭）, On（运行）, Idle（怠速）
    if (status.engineState === 'On' || status.engineState === 'Idle') {
      status.isActive = true;
    }
  }

  // 2. 检查发动机转速 (engineRpm)
  if (stat.engineRpm && Array.isArray(stat.engineRpm) && stat.engineRpm.length > 0) {
    const latestRpm = stat.engineRpm[stat.engineRpm.length - 1];
    status.rpm = latestRpm?.value || 0;
    
    // 如果转速 > 0，说明引擎在运行
    if (status.rpm > 0) {
      status.isActive = true;
      // 根据转速判断状态
      if (status.engineState === 'Unknown') {
        status.engineState = status.rpm > 1000 ? 'On' : 'Idle';
      }
    }
  }

  // 3. 检查车速 (ecuSpeedMph)
  if (stat.ecuSpeedMph && Array.isArray(stat.ecuSpeedMph) && stat.ecuSpeedMph.length > 0) {
    const latestSpeed = stat.ecuSpeedMph[stat.ecuSpeedMph.length - 1];
    status.speed = latestSpeed?.value || 0;
    
    // 如果车速 > 0，说明车辆在行驶
    if (status.speed > 0) {
      status.isActive = true;
      if (status.engineState === 'Unknown' || status.engineState === 'Idle') {
        status.engineState = 'On';
      }
    }
  }

  // 4. 检查燃油百分比 (fuelPercents)
  if (stat.fuelPercents && Array.isArray(stat.fuelPercents) && stat.fuelPercents.length > 0) {
    const latestFuel = stat.fuelPercents[stat.fuelPercents.length - 1];
    status.fuelPercent = latestFuel?.value || 0;
  }

  // 5. 检查是否有活跃的 OBD 司机
  if (stat.obdDriver && stat.obdDriver.driver) {
    status.hasDriver = true;
    status.driverName = stat.obdDriver.driver.name;
    // 如果有司机，车辆应该是活跃的
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
