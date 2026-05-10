# Samsara Vehicle Stats API 参考文档

## API 端点

```
GET https://api.samsara.com/fleet/vehicles/stats
```

## 认证

```http
Authorization: Bearer YOUR_SAMSARA_API_TOKEN
Accept: application/json
```

## 权限要求

需要在 Samsara API Token 中启用：
- ✅ **Read Vehicle Statistics** (车辆统计数据读取权限)

## 查询参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `types` | string | ✅ 是 | 要获取的状态类型，逗号分隔，最多 3 个 |
| `time` | string | ❌ 否 | RFC 3339 格式的时间戳，默认为当前时间 |
| `vehicleIds` | string | ❌ 否 | 车辆 ID 列表，逗号分隔 |
| `tagIds` | string | ❌ 否 | 标签 ID 列表，逗号分隔 |
| `parentTagIds` | string | ❌ 否 | 父标签 ID 列表（包含子标签） |
| `after` | string | ❌ 否 | 分页游标（来自上一页的 endCursor） |

## 可用的状态类型 (types)

### 🚗 引擎相关

| 类型 | 说明 | 单位 | 值示例 |
|------|------|------|--------|
| `engineStates` | 引擎状态 | - | `Off`, `On`, `Idle` |
| `engineRpm` | 发动机转速 | RPM | `1500` |
| `engineLoadPercent` | 引擎负载 | % | `75` |
| `engineCoolantTemperatureMilliC` | 冷却液温度 | 毫摄氏度 | `85000` (85°C) |
| `engineOilPressureKPa` | 机油压力 | 千帕 | `350` |
| `engineImmobilizer` | 引擎防盗器 | - | `ignition_enabled`, `ignition_disabled` |

### 🚙 车辆运行

| 类型 | 说明 | 单位 | 值示例 |
|------|------|------|--------|
| `ecuSpeedMph` | ECU 速度 | mph | `45.5` |
| `obdOdometerMeters` | 里程表 | 米 | `150000` |
| `gps` | GPS 位置 | - | `{lat: 37.7749, lng: -122.4194}` |

### ⛽ 燃油和电池

| 类型 | 说明 | 单位 | 值示例 |
|------|------|------|--------|
| `fuelPercents` | 燃油百分比 | % | `75.5` |
| `defLevelMilliPercent` | DEF 液位 | 千分比 | `99001` (99%) |
| `batteryMilliVolts` | 电池电压 | 毫伏 | `12500` (12.5V) |

### 👤 司机信息

| 类型 | 说明 | 单位 | 值示例 |
|------|------|------|--------|
| `obdDriver` | OBD 司机 | - | `{driver: {id, name}}` |

### 🌡️ 环境传感器

| 类型 | 说明 | 单位 | 值示例 |
|------|------|------|--------|
| `ambientAirTemperatureMilliC` | 环境温度 | 毫摄氏度 | `25000` (25°C) |
| `barometricPressurePa` | 气压 | 帕斯卡 | `101325` |

### 🔌 辅助输入

| 类型 | 说明 | 单位 | 值示例 |
|------|------|------|--------|
| `auxInput1` | 辅助输入 1 | - | 自定义 |
| `auxInput2` | 辅助输入 2 | - | 自定义 |
| `auxInput3-auxInput13` | 辅助输入 3-13 | - | 自定义 |

**注意：** `auxInput3-auxInput10` 算作一个类型，不会占用多个类型配额。

## 请求示例

### 基础请求

```bash
curl -X GET "https://api.samsara.com/fleet/vehicles/stats?types=engineStates,obdDriver,fuelPercents" \
  -H "Authorization: Bearer samsara_api_xxxxx" \
  -H "Accept: application/json"
```

### 带时间筛选

```bash
curl -X GET "https://api.samsara.com/fleet/vehicles/stats?types=engineStates&time=2026-05-10T10:00:00Z" \
  -H "Authorization: Bearer samsara_api_xxxxx"
```

### 按车辆 ID 筛选

```bash
curl -X GET "https://api.samsara.com/fleet/vehicles/stats?types=engineStates&vehicleIds=281474976710700,281474976710701" \
  -H "Authorization: Bearer samsara_api_xxxxx"
```

### JavaScript/TypeScript

```typescript
const SAMSARA_TOKEN = 'samsara_api_xxxxx';

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

## 响应格式

### 成功响应 (200 OK)

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
      
      "engineRpm": [
        {
          "value": 1500,
          "time": "2026-05-10T10:30:00Z"
        }
      ],
      
      "ecuSpeedMph": [
        {
          "value": 45.5,
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
      ],
      
      "obdOdometerMeters": [
        {
          "value": 150000,
          "time": "2026-05-10T10:30:00Z"
        }
      ],
      
      "gps": [
        {
          "latitude": 37.7749,
          "longitude": -122.4194,
          "time": "2026-05-10T10:30:00Z",
          "speedMilesPerHour": 45.5,
          "headingDegrees": 180
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

### 错误响应

#### 400 Bad Request

```json
{
  "message": "Invalid types parameter. Maximum 3 types allowed."
}
```

**常见原因：**
- `types` 参数超过 3 个类型
- `types` 参数格式错误
- 时间格式不正确

#### 401 Unauthorized

```json
{
  "message": "Invalid or expired token"
}
```

**原因：** API Token 无效或已过期

#### 403 Forbidden

```json
{
  "message": "Insufficient permissions"
}
```

**原因：** Token 没有 "Read Vehicle Statistics" 权限

## 数据结构说明

### 时间序列数据

大多数状态类型返回时间序列数组：

```typescript
interface TimeSeriesValue {
  value: number | string;
  time: string; // RFC 3339 格式
}

// 示例
engineRpm: [
  { value: 1500, time: "2026-05-10T10:30:00Z" },
  { value: 1600, time: "2026-05-10T10:30:05Z" }
]
```

**获取最新值：**
```typescript
const latestRpm = stat.engineRpm[stat.engineRpm.length - 1];
console.log(latestRpm.value); // 1600
```

### 引擎状态值

```typescript
type EngineState = 'Off' | 'On' | 'Idle';

// Off: 引擎关闭
// On: 引擎运行中
// Idle: 引擎怠速
```

### OBD 司机对象

```typescript
interface OBDDriver {
  driver: {
    id: string;
    name: string;
  }
}

// 示例
obdDriver: {
  driver: {
    id: "281474976710800",
    name: "John Doe"
  }
}
```

### GPS 位置对象

```typescript
interface GPSLocation {
  latitude: number;
  longitude: number;
  time: string;
  speedMilesPerHour?: number;
  headingDegrees?: number;
}
```

## 使用限制

### Types 参数限制

- ✅ 最多 3 个类型
- ✅ `auxInput3-auxInput10` 算作 1 个类型
- ❌ 不能超过 3 个类型配额

**有效示例：**
```
✅ types=engineStates,obdDriver,fuelPercents
✅ types=engineStates,engineRpm,ecuSpeedMph
✅ types=engineStates,obdOdometerMeters,auxInput3,auxInput4,auxInput5
```

**无效示例：**
```
❌ types=engineStates,obdDriver,fuelPercents,ecuSpeedMph  (4 个类型)
❌ types=engineStates,engineRpm,auxInput1,auxInput2  (4 个类型)
```

### 速率限制

Samsara API 有速率限制，具体取决于你的账户类型。建议：
- 使用缓存减少请求次数
- 批量获取数据而不是频繁请求
- 使用 `vehicleIds` 参数只获取需要的车辆

## 最佳实践

### 1. 选择合适的状态类型

**判断车辆是否活跃：**
```
types=engineStates,engineRpm,ecuSpeedMph
```

**获取完整车辆信息：**
```
types=engineStates,obdDriver,fuelPercents
```

**监控车辆健康：**
```
types=engineCoolantTemperatureMilliC,engineOilPressureKPa,batteryMilliVolts
```

### 2. 处理缺失数据

并非所有车辆都有所有状态类型的数据：

```typescript
// 安全地访问数据
const engineState = stat.engineStates?.[stat.engineStates.length - 1]?.value || 'Unknown';
const rpm = stat.engineRpm?.[stat.engineRpm.length - 1]?.value || 0;
```

### 3. 使用多个指标判断

不要只依赖一个状态类型：

```typescript
function isVehicleActive(stat: any): boolean {
  // 方法 1: 引擎状态
  if (stat.engineStates?.length > 0) {
    const state = stat.engineStates[stat.engineStates.length - 1].value;
    if (state === 'On' || state === 'Idle') return true;
  }
  
  // 方法 2: 转速
  if (stat.engineRpm?.length > 0) {
    const rpm = stat.engineRpm[stat.engineRpm.length - 1].value;
    if (rpm > 0) return true;
  }
  
  // 方法 3: 速度
  if (stat.ecuSpeedMph?.length > 0) {
    const speed = stat.ecuSpeedMph[stat.ecuSpeedMph.length - 1].value;
    if (speed > 0) return true;
  }
  
  // 方法 4: 有司机
  if (stat.obdDriver?.driver) return true;
  
  return false;
}
```

### 4. 缓存和刷新策略

```typescript
// 使用 React Query 缓存
const { data } = useQuery({
  queryKey: ['vehicle-stats'],
  queryFn: fetchVehicleStats,
  staleTime: 30000,      // 30 秒内使用缓存
  refetchInterval: 60000 // 每分钟自动刷新
});
```

## 常见问题

### Q: 为什么某些车辆没有 engineStates 数据？

A: 可能的原因：
1. 车辆没有安装 OBD 设备
2. 车辆长时间未启动（超过数据保留期）
3. 设备离线或信号不好

**解决方案：** 使用其他指标（rpm, speed）作为备用判断。

### Q: 如何获取历史数据？

A: 使用 `time` 参数：
```
?types=engineStates&time=2026-05-10T10:00:00Z
```

这会返回该时间点之前的最后已知状态。

### Q: 如何处理分页？

A: 使用 `after` 参数：
```typescript
let allData = [];
let cursor = null;

do {
  const url = cursor 
    ? `...?types=engineStates&after=${cursor}`
    : `...?types=engineStates`;
  
  const response = await fetch(url, { headers });
  const data = await response.json();
  
  allData.push(...data.data);
  cursor = data.pagination?.endCursor;
} while (data.pagination?.hasNextPage);
```

### Q: 数据更新频率是多少？

A: 取决于车辆的 OBD 设备和网络连接，通常：
- GPS 位置：每 1-5 秒
- 引擎状态：实时
- 其他传感器：每 5-30 秒

### Q: 如何减少 API 调用次数？

A: 
1. 使用缓存（React Query, SWR 等）
2. 只在需要时刷新
3. 使用 `vehicleIds` 参数只获取需要的车辆
4. 批量处理而不是逐个请求

## 相关 API

- **GET /fleet/vehicles** - 获取车辆列表
- **GET /fleet/vehicles/locations** - 获取车辆位置
- **GET /fleet/driver-vehicle-assignments** - 获取司机-车辆分配
- **GET /fleet/drivers** - 获取司机列表

## 参考资料

- [Samsara API 官方文档](https://developers.samsara.com/reference/getvehiclestats)
- [Telematics 指南](https://developers.samsara.com/docs/telematics)
- [API 认证](https://developers.samsara.com/docs/authentication)
- [速率限制](https://developers.samsara.com/docs/rate-limits)

## 更新日志

- **2026-05-10**: 创建文档，基于 Samsara API v2
