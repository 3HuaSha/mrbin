# ETA (预计到达时间) 功能说明

## 功能概述

在实时地图页面添加了 ETA（Estimated Time of Arrival）功能，可以显示司机到达各个订单位置的预计时间。

## 功能特点

### 1. 实时位置获取
- 从 Samsara API 获取车辆的实时 GPS 位置
- 通过车辆分配表关联司机和车辆

### 2. 智能路线计算
- 使用 Google Maps Distance Matrix API 计算路线
- 考虑实时交通状况（`duration_in_traffic`）
- 按订单顺序依次计算，累计时间

### 3. ETA 显示
- 显示预计到达时间点（例如：14:30）
- 显示剩余时间（例如：15 分钟）
- 只在订单卡片上显示，手动步骤不显示

## 使用方法

### 1. 打开实时地图页面
导航到实时地图页面（Fleet Map）

### 2. 点击"显示 ETA"按钮
- 位置：左侧栏，日期选择器下方
- 按钮会显示加载状态："计算中..."
- 计算完成后按钮变为："刷新 ETA"

### 3. 查看 ETA 信息
- 展开司机卡片
- 每个订单卡片下方会显示蓝色的 ETA 信息
- 格式：`ETA: 14:30 (15 分钟)`

### 4. 刷新 ETA
- 点击"刷新 ETA"按钮重新计算
- 建议每 5-10 分钟刷新一次以获取最新数据

## 技术实现

### 数据流程

```
1. 用户点击"显示 ETA"
   ↓
2. 获取 Samsara 车辆位置
   ↓
3. 查询车辆分配表（driver_vehicle_assignments）
   ↓
4. 匹配司机、车辆、订单
   ↓
5. 调用 Google Maps Distance Matrix API
   ↓
6. 计算每个订单的 ETA
   ↓
7. 显示在订单卡片上
```

### API 调用

#### Google Maps Distance Matrix API
```typescript
GET https://maps.googleapis.com/maps/api/distancematrix/json
Parameters:
  - origins: 司机当前位置（lat,lng）
  - destinations: 订单地址
  - mode: driving
  - departure_time: now
  - traffic_model: best_guess
  - key: GOOGLE_MAPS_API_KEY
```

#### 响应示例
```json
{
  "rows": [{
    "elements": [{
      "distance": { "text": "5.2 km", "value": 5200 },
      "duration": { "text": "12 mins", "value": 720 },
      "duration_in_traffic": { "text": "15 mins", "value": 900 },
      "status": "OK"
    }]
  }]
}
```

### 核心函数

#### `calculateDriverETA`
计算司机到达所有订单的 ETA

**参数：**
- `driverId`: 司机 ID
- `driverName`: 司机姓名
- `currentLocation`: 当前位置 `{ lat, lng }`
- `orders`: 订单列表 `[{ id, address }]`
- `apiKey`: Google Maps API 密钥

**返回：**
```typescript
{
  driverId: string;
  driverName: string;
  currentLocation: { lat, lng };
  orders: [{
    orderId: string;
    orderAddress: string;
    distance: string;      // "5.2 km"
    duration: string;      // "12 mins"
    durationValue: number; // 720 (秒)
    eta: Date;            // 预计到达时间
    status: 'OK' | 'ERROR';
  }];
  totalDuration: number;
  lastUpdated: Date;
}
```

#### `formatETA`
格式化 ETA 显示（相对时间）

**示例：**
- `15 分钟`
- `1 小时 30 分钟`
- `已过期`

#### `formatETATime`
格式化 ETA 显示（时间点）

**示例：**
- `14:30`
- `09:15`

## 数据库依赖

### 表：`driver_vehicle_assignments`
关联司机和车辆

```sql
SELECT 
  driver_id,
  vehicle_id,
  profiles.name as driver_name,
  vehicles.name as vehicle_name,
  vehicles.samsara_id
FROM driver_vehicle_assignments
JOIN profiles ON profiles.id = driver_id
JOIN vehicles ON vehicles.id = vehicle_id
```

### 表：`job_steps`
获取司机的订单列表

```sql
SELECT *
FROM job_steps
WHERE driver_id = ? 
  AND scheduled_date = ?
  AND node_type = 'order'
ORDER BY step_number
```

## 性能考虑

### API 调用限制
- Google Maps Distance Matrix API 有配额限制
- 建议：
  - 不要频繁刷新（建议间隔 5-10 分钟）
  - 只在需要时计算 ETA
  - 考虑缓存结果

### 优化建议
1. **批量请求**：一次请求计算多个目的地
2. **缓存结果**：在一定时间内使用缓存的 ETA
3. **后台计算**：定时在后台计算，前端直接读取

## 错误处理

### 可能的错误情况

1. **无法获取车辆位置**
   - 原因：Samsara API 失败或车辆离线
   - 显示：不显示 ETA

2. **地址解析失败**
   - 原因：地址格式不正确或 Google 无法识别
   - 状态：`NOT_FOUND`
   - 显示：不显示 ETA

3. **API 配额超限**
   - 原因：超过 Google Maps API 配额
   - 显示：错误提示

4. **网络错误**
   - 原因：网络连接问题
   - 显示：错误提示

## 未来改进

### 1. 自动刷新
- 每 5 分钟自动刷新 ETA
- 显示上次更新时间

### 2. 路线优化建议
- 分析 ETA 数据
- 建议更优的订单顺序

### 3. 延迟预警
- 如果 ETA 超过预定时间窗口，显示警告
- 自动通知调度员

### 4. 历史数据分析
- 记录实际到达时间
- 对比 ETA 准确性
- 优化算法

### 5. 多路线对比
- 计算不同订单顺序的总时长
- 推荐最优路线

## 相关文件

- `src/lib/eta-calculator.ts` - ETA 计算核心逻辑
- `src/pages/FleetMapPage.tsx` - 实时地图页面（添加 ETA 功能）
- `src/lib/samsara-api.ts` - Samsara API 集成
- `src/components/DispatchMapWidget.tsx` - 地图组件

## 环境变量

需要在 `.env` 文件中配置：

```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

**注意：** 确保 API 密钥启用了以下 API：
- Distance Matrix API
- Geocoding API（如果需要地址解析）

## 成本估算

### Google Maps API 定价（2024）
- Distance Matrix API: $5 per 1000 requests
- 每个司机每次刷新：1 次请求 × 订单数量
- 示例：10 个司机，每人 5 个订单，每天刷新 10 次
  - 总请求：10 × 5 × 10 = 500 requests/day
  - 月成本：500 × 30 / 1000 × $5 = $75/month

### 优化建议
- 使用批量请求减少 API 调用
- 缓存结果减少重复计算
- 只在必要时刷新 ETA
