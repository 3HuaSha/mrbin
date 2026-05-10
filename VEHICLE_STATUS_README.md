# 车辆状态同步系统 - 完整指南

## 📖 概述

基于 Samsara Vehicle Stats API 的车辆状态同步系统，可以准确判断车辆的引擎状态、运行情况和司机信息。

## 🎯 核心功能

### ✅ 多维度车辆状态判断

使用 4 种方法判断车辆是否活跃：

1. **引擎状态** (`engineStates`) - Off / On / Idle
2. **发动机转速** (`engineRpm`) - RPM > 0 表示活跃
3. **车速** (`ecuSpeedMph`) - 速度 > 0 表示行驶中
4. **OBD 司机** (`obdDriver`) - 有司机信息表示活跃

### ✅ 丰富的车辆信息

获取 7 种车辆状态：

- 引擎状态 (On/Off/Idle)
- 发动机转速 (RPM)
- 车速 (mph)
- 燃油百分比 (%)
- 里程表 (米)
- GPS 位置
- 司机信息

### ✅ 自动司机关联

从活跃车辆中自动识别和关联司机：

- 从实时分配接口获取
- 从 OBD 司机信息获取
- 从司机档案获取
- 从车辆静态分配获取

## 📁 文件结构

```
task1/
├── src/
│   ├── actions/
│   │   └── samsara.ts                    # Samsara API 调用
│   ├── lib/
│   │   └── vehicle-status.ts             # 车辆状态工具函数 ⭐ 新增
│   └── pages/
│       └── FleetPage.tsx                 # 车队页面（已改进）
│
├── test-vehicle-stats.js                 # API 测试脚本 ⭐ 新增
│
└── 文档/
    ├── QUICK_START_VEHICLE_SYNC.md       # 快速开始 ⭐ 推荐
    ├── VEHICLE_SYNC_SUMMARY.md           # 改进总结
    ├── VEHICLE_STATUS_SYNC_IMPROVEMENTS.md  # 技术细节
    ├── VEHICLE_STATUS_USAGE_EXAMPLES.md  # 使用示例
    ├── SAMSARA_STATS_API_REFERENCE.md    # API 参考
    └── VEHICLE_STATUS_README.md          # 本文档
```

## 🚀 快速开始

### 1. 测试 API

```bash
node test-vehicle-stats.js
```

### 2. 同步车辆

1. 打开"司机与车辆"页面
2. 点击"从 Samsara 同步"
3. 查看活跃车辆

### 3. 在代码中使用

```typescript
import { getActiveVehicleIds, extractVehicleStatus } from "@/lib/vehicle-status";

// 获取活跃车辆
const activeIds = getActiveVehicleIds(vehicleStats);

// 获取详细状态
const status = extractVehicleStatus(stat);
```

详细说明请查看 [QUICK_START_VEHICLE_SYNC.md](./QUICK_START_VEHICLE_SYNC.md)

## 📚 文档导航

### 🌟 推荐阅读顺序

1. **[QUICK_START_VEHICLE_SYNC.md](./QUICK_START_VEHICLE_SYNC.md)** ⭐ 必读
   - 5 分钟快速上手
   - 测试和使用方法
   - 常见问题解答

2. **[VEHICLE_SYNC_SUMMARY.md](./VEHICLE_SYNC_SUMMARY.md)**
   - 改进内容总结
   - 数据流程说明
   - 调试方法

3. **[VEHICLE_STATUS_USAGE_EXAMPLES.md](./VEHICLE_STATUS_USAGE_EXAMPLES.md)**
   - 实际应用场景
   - 代码示例
   - 最佳实践

### 📖 参考文档

4. **[VEHICLE_STATUS_SYNC_IMPROVEMENTS.md](./VEHICLE_STATUS_SYNC_IMPROVEMENTS.md)**
   - 技术实现细节
   - API 参数说明
   - 工具函数文档

5. **[SAMSARA_STATS_API_REFERENCE.md](./SAMSARA_STATS_API_REFERENCE.md)**
   - 完整 API 参考
   - 所有状态类型说明
   - 请求响应示例

## 🔧 核心 API

### VehicleStatus 接口

```typescript
interface VehicleStatus {
  id: string;              // Samsara 车辆 ID
  name?: string;           // 车辆名称
  isActive: boolean;       // 是否活跃 ⭐
  engineState: 'Off' | 'On' | 'Idle' | 'Unknown';
  rpm?: number;            // 发动机转速
  speed?: number;          // 车速 (mph)
  fuelPercent?: number;    // 燃油百分比
  hasDriver: boolean;      // 是否有司机
  driverName?: string;     // 司机名称
  lastUpdate?: string;     // 最后更新时间
}
```

### 工具函数

```typescript
// 提取单个车辆状态
extractVehicleStatus(stat: any): VehicleStatus

// 批量提取所有车辆状态
extractAllVehicleStatuses(stats: any[]): Map<string, VehicleStatus>

// 获取活跃车辆 ID 集合
getActiveVehicleIds(stats: any[]): Set<string>

// 格式化状态用于显示
formatVehicleStatus(status: VehicleStatus): string
```

## 💡 使用示例

### 基础使用

```typescript
import { getActiveVehicleIds, extractVehicleStatus } from "@/lib/vehicle-status";
import { fetchSamsaraData } from "@/actions/samsara";

// 获取数据
const result = await fetchSamsaraData();
const { vehicleStats } = result;

// 获取活跃车辆
const activeIds = getActiveVehicleIds(vehicleStats);
console.log(`找到 ${activeIds.size} 辆活跃车辆`);

// 显示详细状态
vehicleStats.forEach(stat => {
  const status = extractVehicleStatus(stat);
  if (status.isActive) {
    console.log(`${status.name}: ${status.engineState}, ${status.rpm} RPM, ${status.speed} mph`);
  }
});
```

### 高级使用

```typescript
// 生成车队报告
import { extractAllVehicleStatuses } from "@/lib/vehicle-status";

const statusMap = extractAllVehicleStatuses(vehicleStats);

const report = {
  total: statusMap.size,
  active: Array.from(statusMap.values()).filter(s => s.isActive).length,
  idle: Array.from(statusMap.values()).filter(s => s.engineState === 'Idle').length,
  withDriver: Array.from(statusMap.values()).filter(s => s.hasDriver).length
};

console.log(`车队状态: ${report.active}/${report.total} 活跃, ${report.withDriver} 有司机`);
```

更多示例请查看 [VEHICLE_STATUS_USAGE_EXAMPLES.md](./VEHICLE_STATUS_USAGE_EXAMPLES.md)

## 🔍 调试

### 1. 运行测试脚本

```bash
node test-vehicle-stats.js
```

### 2. 查看控制台日志

同步时会输出详细日志：

```
🚗 活跃车辆: BIN#1 (状态: On, 1500 RPM, 45 mph, 司机: John Doe)
📊 找到 2 辆活跃车辆
```

### 3. 检查原始数据

在浏览器控制台：

```javascript
window.__SAMSARA_DEBUG__
```

## ⚠️ 常见问题

### Q: 同步后没有活跃车辆？

**检查：**
1. 运行 `node test-vehicle-stats.js`
2. 查看控制台日志
3. 检查 `window.__SAMSARA_DEBUG__.sStats`

### Q: API 返回 400 错误？

**原因：**
- `types` 参数超过 3 个类型
- Token 没有权限

**解决：**
- 减少 types 数量
- 检查 Token 权限

### Q: 某些车辆状态显示 "Unknown"？

**原因：** 车辆没有 `engineStates` 数据

**影响：** 系统会自动使用其他指标判断，不影响功能

更多问题请查看 [QUICK_START_VEHICLE_SYNC.md](./QUICK_START_VEHICLE_SYNC.md)

## 📊 改进对比

### 之前 ❌

```typescript
// 只检查一个状态
if (latestState?.value === 'On' || latestState?.value === 'Idle') {
  activeVehicleIds.add(stat.id);
}
```

**问题：**
- 只依赖 `engineStates`
- 如果数据缺失就无法判断
- 没有详细信息

### 现在 ✅

```typescript
// 使用工具函数，自动检查 4 种状态
const activeIds = getActiveVehicleIds(sStats);

// 获取详细信息
const status = extractVehicleStatus(stat);
console.log(status.engineState, status.rpm, status.speed, status.driverName);
```

**优势：**
- 4 种判断方法
- 容错能力强
- 信息更全面
- 代码更清晰

## 🎯 技术亮点

### 1. 多维度判断

不依赖单一数据源，使用多个指标交叉验证：

```typescript
// 引擎状态
if (engineState === 'On' || engineState === 'Idle') → 活跃

// 发动机转速
if (rpm > 0) → 活跃

// 车速
if (speed > 0) → 活跃

// 司机信息
if (hasDriver) → 活跃
```

### 2. 容错设计

即使某个状态缺失，也能通过其他状态判断：

```typescript
// 安全访问
const rpm = stat.engineRpm?.[stat.engineRpm.length - 1]?.value || 0;
```

### 3. 类型安全

完整的 TypeScript 类型定义：

```typescript
interface VehicleStatus {
  isActive: boolean;
  engineState: 'Off' | 'On' | 'Idle' | 'Unknown';
  // ...
}
```

### 4. 易于扩展

清晰的函数接口，方便添加新功能：

```typescript
// 添加新的判断逻辑
export function isVehicleMoving(status: VehicleStatus): boolean {
  return status.speed !== undefined && status.speed > 0;
}
```

## 🔄 数据流程

```
用户点击"同步"
    ↓
fetchSamsaraData()
    ↓
GET /fleet/vehicles/stats
    ↓
getActiveVehicleIds()
    ├─ 检查 engineStates
    ├─ 检查 engineRpm
    ├─ 检查 ecuSpeedMph
    └─ 检查 obdDriver
    ↓
更新数据库
    ↓
前端显示
```

## 📈 性能优化

### 1. 缓存策略

```typescript
const { data } = useQuery({
  queryKey: ['vehicle-stats'],
  queryFn: fetchSamsaraData,
  staleTime: 30000,      // 30 秒缓存
  refetchInterval: 60000 // 每分钟刷新
});
```

### 2. 按需获取

```typescript
// 只获取需要的状态类型
const minimalTypes = 'engineStates,engineRpm,ecuSpeedMph';
```

### 3. 批量处理

```typescript
// 一次性处理所有车辆
const statusMap = extractAllVehicleStatuses(vehicleStats);
```

## 🛠️ 开发指南

### 修改判断逻辑

编辑 `src/lib/vehicle-status.ts`:

```typescript
export function extractVehicleStatus(stat: any): VehicleStatus {
  // 添加你的判断逻辑
}
```

### 添加新的状态类型

1. 更新 `VehicleStatus` 接口
2. 在 `extractVehicleStatus` 中添加提取逻辑
3. 更新 `formatVehicleStatus` 显示逻辑

### 测试

```bash
# 测试 API
node test-vehicle-stats.js

# 在浏览器中测试
window.__SAMSARA_DEBUG__
```

## 📞 支持

### 文档

- [快速开始](./QUICK_START_VEHICLE_SYNC.md)
- [使用示例](./VEHICLE_STATUS_USAGE_EXAMPLES.md)
- [API 参考](./SAMSARA_STATS_API_REFERENCE.md)

### 调试

1. 运行测试脚本
2. 查看控制台日志
3. 检查原始数据

### 相关文档

- [ACTIVE_DRIVER_SYNC_EXPLANATION.md](./ACTIVE_DRIVER_SYNC_EXPLANATION.md) - 司机同步说明
- [Samsara API 文档](https://developers.samsara.com/reference/getvehiclestats)

## 🎉 总结

这个车辆状态同步系统提供了：

- ✅ **准确** - 4 种判断方法
- ✅ **全面** - 7 种状态信息
- ✅ **可靠** - 容错能力强
- ✅ **易用** - 完整工具函数
- ✅ **文档** - 详细使用说明

现在可以准确地识别哪些车辆的引擎正在运行，并自动关联对应的司机！

---

**最后更新：** 2026-05-10  
**版本：** 1.0.0
