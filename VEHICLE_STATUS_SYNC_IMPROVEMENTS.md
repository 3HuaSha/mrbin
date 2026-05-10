# 车辆状态同步改进说明

## 概述

基于 Samsara Vehicle Stats API 改进了车队页面的车辆状态同步功能，现在可以更准确地判断车辆是否活跃。

## 改进内容

### 1. 使用更全面的 Stats API 参数

**之前：**
```typescript
// 只获取 3 个基本状态
types=obdDriver,fuelPerc,engineStates
```

**现在：**
```typescript
// 获取 7 个详细状态
types=engineStates,obdDriver,fuelPercents,ecuSpeedMph,obdOdometerMeters,engineRpm,gps
```

### 2. 多维度判断车辆活跃状态

创建了新的工具函数 `src/lib/vehicle-status.ts`，使用 4 种方法判断车辆是否活跃：

#### 方法 1: 引擎状态 (engineStates)
- `On` (运行中) → 活跃
- `Idle` (怠速) → 活跃
- `Off` (关闭) → 不活跃

#### 方法 2: 发动机转速 (engineRpm)
- RPM > 0 → 活跃
- RPM > 1000 → 判定为 "On"
- 0 < RPM ≤ 1000 → 判定为 "Idle"

#### 方法 3: 车速 (ecuSpeedMph)
- 速度 > 0 → 活跃且判定为 "On"

#### 方法 4: OBD 司机信息 (obdDriver)
- 有司机信息 → 活跃

### 3. 新增的车辆状态信息

`VehicleStatus` 接口现在包含：

```typescript
interface VehicleStatus {
  id: string;              // Samsara 车辆 ID
  name?: string;           // 车辆名称
  isActive: boolean;       // 是否活跃
  engineState: 'Off' | 'On' | 'Idle' | 'Unknown';  // 引擎状态
  rpm?: number;            // 发动机转速
  speed?: number;          // 车速 (mph)
  fuelPercent?: number;    // 燃油百分比
  hasDriver: boolean;      // 是否有司机
  driverName?: string;     // 司机名称
  lastUpdate?: string;     // 最后更新时间
}
```

## 使用方法

### 在 FleetPage 中使用

```typescript
import { getActiveVehicleIds, extractVehicleStatus } from "@/lib/vehicle-status";

// 获取所有活跃车辆的 ID
const activeVehicleIds = getActiveVehicleIds(sStats);

// 获取单个车辆的详细状态
const status = extractVehicleStatus(stat);
console.log(`车辆 ${status.name}: ${status.engineState}, ${status.rpm} RPM, ${status.speed} mph`);
```

### 工具函数

```typescript
// 1. 提取单个车辆状态
extractVehicleStatus(stat: any): VehicleStatus

// 2. 批量提取所有车辆状态
extractAllVehicleStatuses(stats: any[]): Map<string, VehicleStatus>

// 3. 获取活跃车辆 ID 集合
getActiveVehicleIds(stats: any[]): Set<string>

// 4. 格式化状态用于显示
formatVehicleStatus(status: VehicleStatus): string
```

## API 参考

### Samsara Vehicle Stats API

**端点：** `GET https://api.samsara.com/fleet/vehicles/stats`

**参数：**
- `types` (required): 要获取的状态类型，逗号分隔，最多 3 个类型
  - 注意：`auxInput3-auxInput10` 算作一个类型

**可用的状态类型：**

| 类型 | 说明 | 单位 |
|------|------|------|
| `engineStates` | 引擎状态 | Off/On/Idle |
| `engineRpm` | 发动机转速 | RPM |
| `ecuSpeedMph` | ECU 速度 | mph |
| `obdDriver` | OBD 司机信息 | - |
| `fuelPercents` | 燃油百分比 | % |
| `obdOdometerMeters` | 里程表 | 米 |
| `gps` | GPS 位置 | - |
| `engineCoolantTemperatureMilliC` | 冷却液温度 | 毫摄氏度 |
| `engineOilPressureKPa` | 机油压力 | 千帕 |
| `batteryMilliVolts` | 电池电压 | 毫伏 |

**示例请求：**
```bash
curl -X GET "https://api.samsara.com/fleet/vehicles/stats?types=engineStates,obdDriver,fuelPercents" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**示例响应：**
```json
{
  "data": [
    {
      "id": "281474976710700",
      "name": "BIN#1",
      "engineStates": [
        {
          "value": "On",
          "time": "2026-05-10T10:30:00Z"
        }
      ],
      "obdDriver": {
        "driver": {
          "id": "281474976710800",
          "name": "John Doe"
        }
      },
      "fuelPercents": [
        {
          "value": 75.5,
          "time": "2026-05-10T10:30:00Z"
        }
      ]
    }
  ]
}
```

## 同步逻辑改进

### 车辆同步
1. 从 Stats API 获取所有车辆的实时状态
2. 使用多维度判断识别活跃车辆
3. 将活跃状态写入数据库的 `is_active` 字段
4. 在车队页面可以筛选"活跃车辆"

### 司机同步
1. 从活跃车辆中提取司机信息
2. 支持从多个数据源识别司机：
   - 实时分配接口 (`driver-vehicle-assignments`)
   - OBD 司机信息 (`obdDriver`)
   - 司机档案的车辆分配
   - 车辆侧的静态分配
3. 自动合并重复的司机账户（去除括号后缀）

## 调试

同步时会在控制台输出详细日志：

```
🚗 活跃车辆: BIN#1 (状态: On, 1500 RPM, 45 mph, 司机: John Doe)
🚗 活跃车辆: FLAT#2 (状态: Idle, 800 RPM, 0 mph)
📊 找到 2 辆活跃车辆
```

可以在浏览器控制台查看原始数据：
```javascript
window.__SAMSARA_DEBUG__
```

## 注意事项

1. **API 限制**：`types` 参数最多支持 3 个类型（`auxInput3-10` 算一个）
2. **数据时效性**：Stats API 返回的是最后已知状态，可能有延迟
3. **权限要求**：需要在 Samsara API Token 中启用 "Read Vehicle Statistics" 权限

## 相关文件

- `src/actions/samsara.ts` - Samsara API 调用
- `src/pages/FleetPage.tsx` - 车队页面和同步逻辑
- `src/lib/vehicle-status.ts` - 车辆状态工具函数（新增）
- `ACTIVE_DRIVER_SYNC_EXPLANATION.md` - 司机同步说明

## 参考资料

- [Samsara Vehicle Stats API 文档](https://developers.samsara.com/reference/getvehiclestats)
- [Samsara Telematics 指南](https://developers.samsara.com/docs/telematics)
