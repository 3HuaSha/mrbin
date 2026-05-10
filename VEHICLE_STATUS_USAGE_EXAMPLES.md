# 车辆状态 API 使用示例

## 快速开始

### 1. 测试 API 连接

运行测试脚本验证 API 是否正常工作：

```bash
node test-vehicle-stats.js
```

这将测试不同的 `types` 组合，并显示活跃车辆列表。

### 2. 在代码中使用

```typescript
import { getActiveVehicleIds, extractVehicleStatus } from "@/lib/vehicle-status";
import { fetchSamsaraData } from "@/actions/samsara";

// 获取 Samsara 数据
const result = await fetchSamsaraData();
const { vehicleStats } = result;

// 方法 1: 获取所有活跃车辆的 ID
const activeIds = getActiveVehicleIds(vehicleStats);
console.log(`找到 ${activeIds.size} 辆活跃车辆`);

// 方法 2: 获取单个车辆的详细状态
vehicleStats.forEach(stat => {
  const status = extractVehicleStatus(stat);
  
  if (status.isActive) {
    console.log(`${status.name}:`);
    console.log(`  引擎: ${status.engineState}`);
    console.log(`  转速: ${status.rpm || 'N/A'} RPM`);
    console.log(`  速度: ${status.speed || 'N/A'} mph`);
    console.log(`  燃油: ${status.fuelPercent || 'N/A'}%`);
    
    if (status.hasDriver) {
      console.log(`  司机: ${status.driverName}`);
    }
  }
});
```

## 实际应用场景

### 场景 1: 车队页面筛选活跃车辆

```typescript
// FleetPage.tsx
const filteredVehicles = vehicles.filter(v => {
  if (vehicleStatusFilter === "ACTIVE") {
    return v.is_active; // 这个字段在同步时已经根据 Stats API 设置
  }
  return true;
});
```

### 场景 2: 实时监控车辆状态

```typescript
import { extractAllVehicleStatuses, formatVehicleStatus } from "@/lib/vehicle-status";

// 获取所有车辆状态
const statusMap = extractAllVehicleStatuses(vehicleStats);

// 显示每辆车的状态
statusMap.forEach((status, vehicleId) => {
  const formatted = formatVehicleStatus(status);
  console.log(`${status.name}: ${formatted}`);
});

// 输出示例:
// BIN#1: 状态: On | 1500 RPM | 45.5 mph | 燃油: 75% | 司机: John Doe
// FLAT#2: 状态: Idle | 800 RPM | 0.0 mph | 燃油: 60%
```

### 场景 3: 自动分配司机到活跃车辆

```typescript
// 同步时只处理活跃车辆的司机
const activeVehicleIds = getActiveVehicleIds(sStats);

// 从活跃车辆中提取司机信息
sStats.forEach(stat => {
  if (activeVehicleIds.has(stat.id)) {
    const status = extractVehicleStatus(stat);
    
    if (status.hasDriver) {
      console.log(`分配司机 ${status.driverName} 到车辆 ${status.name}`);
      // 创建 driver_vehicle_assignment 记录
    }
  }
});
```

### 场景 4: 车辆健康监控

```typescript
// 监控车辆异常状态
vehicleStats.forEach(stat => {
  const status = extractVehicleStatus(stat);
  
  // 检查燃油不足
  if (status.fuelPercent && status.fuelPercent < 20) {
    console.warn(`⚠️ ${status.name} 燃油不足: ${status.fuelPercent}%`);
  }
  
  // 检查引擎怠速时间过长
  if (status.engineState === 'Idle' && status.rpm && status.rpm > 0) {
    console.warn(`⚠️ ${status.name} 引擎怠速中`);
  }
  
  // 检查超速
  if (status.speed && status.speed > 70) {
    console.warn(`⚠️ ${status.name} 超速: ${status.speed} mph`);
  }
});
```

### 场景 5: 生成车辆状态报告

```typescript
import { extractAllVehicleStatuses } from "@/lib/vehicle-status";

function generateFleetReport(vehicleStats: any[]) {
  const statusMap = extractAllVehicleStatuses(vehicleStats);
  
  const report = {
    total: statusMap.size,
    active: 0,
    idle: 0,
    off: 0,
    withDriver: 0,
    avgFuel: 0,
    avgSpeed: 0
  };
  
  let totalFuel = 0;
  let totalSpeed = 0;
  let fuelCount = 0;
  let speedCount = 0;
  
  statusMap.forEach(status => {
    if (status.isActive) report.active++;
    if (status.engineState === 'Idle') report.idle++;
    if (status.engineState === 'Off') report.off++;
    if (status.hasDriver) report.withDriver++;
    
    if (status.fuelPercent) {
      totalFuel += status.fuelPercent;
      fuelCount++;
    }
    
    if (status.speed) {
      totalSpeed += status.speed;
      speedCount++;
    }
  });
  
  report.avgFuel = fuelCount > 0 ? totalFuel / fuelCount : 0;
  report.avgSpeed = speedCount > 0 ? totalSpeed / speedCount : 0;
  
  return report;
}

// 使用
const report = generateFleetReport(vehicleStats);
console.log(`
车队状态报告:
- 总车辆数: ${report.total}
- 活跃车辆: ${report.active}
- 怠速车辆: ${report.idle}
- 停止车辆: ${report.off}
- 有司机车辆: ${report.withDriver}
- 平均燃油: ${report.avgFuel.toFixed(1)}%
- 平均速度: ${report.avgSpeed.toFixed(1)} mph
`);
```

## API 调用示例

### 基础调用

```typescript
// 获取引擎状态和司机信息
const response = await fetch(
  'https://api.samsara.com/fleet/vehicles/stats?types=engineStates,obdDriver,fuelPercents',
  {
    headers: {
      'Authorization': `Bearer ${SAMSARA_TOKEN}`,
      'Accept': 'application/json'
    }
  }
);

const data = await response.json();
console.log(data.data); // 车辆状态数组
```

### 带时间筛选

```typescript
// 获取特定时间点的状态
const timestamp = '2026-05-10T10:00:00Z';
const response = await fetch(
  `https://api.samsara.com/fleet/vehicles/stats?types=engineStates,engineRpm,ecuSpeedMph&time=${timestamp}`,
  { headers }
);
```

### 按车辆 ID 筛选

```typescript
// 只获取特定车辆的状态
const vehicleIds = '281474976710700,281474976710701';
const response = await fetch(
  `https://api.samsara.com/fleet/vehicles/stats?types=engineStates,obdDriver&vehicleIds=${vehicleIds}`,
  { headers }
);
```

### 按标签筛选

```typescript
// 获取特定标签的车辆状态
const tagIds = '1234,5678';
const response = await fetch(
  `https://api.samsara.com/fleet/vehicles/stats?types=engineStates,fuelPercents&tagIds=${tagIds}`,
  { headers }
);
```

## 响应数据结构

```typescript
{
  "data": [
    {
      "id": "281474976710700",
      "name": "BIN#1",
      
      // 引擎状态
      "engineStates": [
        {
          "value": "On",  // Off | On | Idle
          "time": "2026-05-10T10:30:00Z"
        }
      ],
      
      // 发动机转速
      "engineRpm": [
        {
          "value": 1500,
          "time": "2026-05-10T10:30:00Z"
        }
      ],
      
      // ECU 速度
      "ecuSpeedMph": [
        {
          "value": 45.5,
          "time": "2026-05-10T10:30:00Z"
        }
      ],
      
      // OBD 司机
      "obdDriver": {
        "driver": {
          "id": "281474976710800",
          "name": "John Doe"
        }
      },
      
      // 燃油百分比
      "fuelPercents": [
        {
          "value": 75.5,
          "time": "2026-05-10T10:30:00Z"
        }
      ],
      
      // 里程表
      "obdOdometerMeters": [
        {
          "value": 150000,
          "time": "2026-05-10T10:30:00Z"
        }
      ],
      
      // GPS 位置
      "gps": [
        {
          "latitude": 37.7749,
          "longitude": -122.4194,
          "time": "2026-05-10T10:30:00Z"
        }
      ]
    }
  ],
  "pagination": {
    "endCursor": "MTQ4OTQ5NTI1ODAwMDAwMDA6MA==",
    "hasNextPage": false
  }
}
```

## 错误处理

```typescript
try {
  const result = await fetchSamsaraData();
  
  if (!result.success) {
    console.error('获取数据失败:', result.error);
    return;
  }
  
  const { vehicleStats } = result;
  
  if (!vehicleStats || vehicleStats.length === 0) {
    console.warn('没有车辆状态数据');
    return;
  }
  
  // 处理数据
  const activeIds = getActiveVehicleIds(vehicleStats);
  
} catch (error) {
  console.error('同步失败:', error);
  toast.error('无法连接到 Samsara API');
}
```

## 性能优化

### 1. 缓存状态数据

```typescript
// 使用 React Query 缓存
const { data: vehicleStatuses } = useQuery({
  queryKey: ['vehicle-statuses'],
  queryFn: async () => {
    const result = await fetchSamsaraData();
    return extractAllVehicleStatuses(result.vehicleStats);
  },
  staleTime: 30000, // 30 秒内使用缓存
  refetchInterval: 60000 // 每分钟自动刷新
});
```

### 2. 只获取需要的状态类型

```typescript
// 如果只需要判断车辆是否活跃，只获取必要的类型
const minimalTypes = 'engineStates,engineRpm,ecuSpeedMph';

// 如果需要完整信息，获取更多类型
const fullTypes = 'engineStates,obdDriver,fuelPercents,ecuSpeedMph,obdOdometerMeters,engineRpm,gps';
```

### 3. 分页处理大量车辆

```typescript
async function fetchAllVehicleStats() {
  const allStats = [];
  let hasNextPage = true;
  let cursor = null;
  
  while (hasNextPage) {
    const url = cursor 
      ? `https://api.samsara.com/fleet/vehicles/stats?types=engineStates&after=${cursor}`
      : 'https://api.samsara.com/fleet/vehicles/stats?types=engineStates';
    
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    allStats.push(...data.data);
    
    hasNextPage = data.pagination?.hasNextPage || false;
    cursor = data.pagination?.endCursor;
  }
  
  return allStats;
}
```

## 常见问题

### Q: 为什么有些车辆没有状态数据？

A: 可能的原因：
1. 车辆没有安装 OBD 设备
2. 车辆长时间未启动
3. 设备离线或信号不好

### Q: engineStates 显示 "Unknown" 怎么办？

A: 使用其他指标判断：
- 检查 `engineRpm` > 0
- 检查 `ecuSpeedMph` > 0
- 检查是否有 `obdDriver` 信息

### Q: 如何判断车辆正在行驶？

A: 同时满足：
- `engineState` = "On"
- `ecuSpeedMph` > 0
- 可选：`engineRpm` > 1000

### Q: API 返回 400 错误？

A: 检查：
1. `types` 参数是否正确（最多 3 个类型）
2. Token 是否有 "Read Vehicle Statistics" 权限
3. 参数格式是否正确（逗号分隔，无空格）

## 相关文档

- [VEHICLE_STATUS_SYNC_IMPROVEMENTS.md](./VEHICLE_STATUS_SYNC_IMPROVEMENTS.md) - 改进说明
- [ACTIVE_DRIVER_SYNC_EXPLANATION.md](./ACTIVE_DRIVER_SYNC_EXPLANATION.md) - 司机同步说明
- [Samsara API 文档](https://developers.samsara.com/reference/getvehiclestats)
