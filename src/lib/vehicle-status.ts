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

  console.log(`\n🔍 分析车辆: ${stat.name || stat.id}`);
  console.log('原始数据键:', Object.keys(stat));

  // 1. 检查引擎状态 (engineState - 注意是单数!)
  if (stat.engineState && stat.engineState.value) {
    status.engineState = stat.engineState.value || 'Unknown';
    status.lastUpdate = stat.engineState.time;
    
    console.log(`  ✅ engineState: ${status.engineState} (时间: ${status.lastUpdate})`);
    
    // 引擎状态：Off（关闭）, On（运行）, Idle（怠速）
    if (status.engineState === 'On' || status.engineState === 'Idle') {
      status.isActive = true;
      console.log(`  ⭐ 根据引擎状态判定为活跃`);
    }
  } else {
    console.log(`  ❌ engineState: 无数据`);
  }

  // 2. 检查发动机转速 (engineRpm - 可能也是单数)
  if (stat.engineRpm && typeof stat.engineRpm === 'object' && stat.engineRpm.value !== undefined) {
    status.rpm = stat.engineRpm.value || 0;
    console.log(`  ✅ engineRpm: ${status.rpm} RPM`);
    
    if (status.rpm > 0) {
      status.isActive = true;
      if (status.engineState === 'Unknown') {
        status.engineState = status.rpm > 1000 ? 'On' : 'Idle';
      }
      console.log(`  ⭐ 根据转速判定为活跃`);
    }
  } else {
    console.log(`  ❌ engineRpm: 无数据`);
  }

  // 3. 检查车速 (ecuSpeedMph)
  if (stat.ecuSpeedMph && typeof stat.ecuSpeedMph === 'object' && stat.ecuSpeedMph.value !== undefined) {
    status.speed = stat.ecuSpeedMph.value || 0;
    console.log(`  ✅ ecuSpeedMph: ${status.speed} mph`);
    
    if (status.speed > 0) {
      status.isActive = true;
      if (status.engineState === 'Unknown' || status.engineState === 'Idle') {
        status.engineState = 'On';
      }
      console.log(`  ⭐ 根据车速判定为活跃`);
    }
  } else {
    console.log(`  ❌ ecuSpeedMph: 无数据`);
  }

  // 4. 检查燃油百分比 (fuelPercents)
  if (stat.fuelPercents && typeof stat.fuelPercents === 'object' && stat.fuelPercents.value !== undefined) {
    status.fuelPercent = stat.fuelPercents.value || 0;
    console.log(`  ✅ fuelPercents: ${status.fuelPercent}%`);
  } else {
    console.log(`  ❌ fuelPercents: 无数据`);
  }

  // 5. 检查是否有活跃的 OBD 司机
  if (stat.obdDriver && stat.obdDriver.driver) {
    status.hasDriver = true;
    status.driverName = stat.obdDriver.driver.name;
    status.isActive = true;
    console.log(`  ✅ obdDriver: ${status.driverName}`);
    console.log(`  ⭐ 根据司机信息判定为活跃`);
  } else {
    console.log(`  ❌ obdDriver: 无数据`);
  }

  console.log(`  📊 最终判定: ${status.isActive ? '✅ 活跃' : '❌ 不活跃'} (状态: ${status.engineState})`);

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
