# 车辆状态同步 - 快速开始

## 🚀 5 分钟快速上手

### 1. 测试 API 连接

首先确认 Samsara API 可以正常访问：

```bash
node test-vehicle-stats.js
```

**预期输出：**
```
🧪 测试 Samsara Vehicle Stats API

📋 测试: 基础状态
   Types: engineStates,obdDriver,fuelPercents
   状态码: 200
   ✅ 成功获取 15 辆车的数据

🔍 测试活跃车辆检测
总车辆数: 15
活跃车辆数: 3
```

如果看到 ✅ 说明 API 正常工作！

### 2. 在车队页面同步

1. 打开应用，进入"司机与车辆"页面
2. 点击右上角的"从 Samsara 同步"按钮
3. 等待同步完成（通常 5-10 秒）

**同步完成后会显示：**
```
✅ 同步完成！车辆: 15, 司机: 8, 活跃分配: 3
```

### 3. 查看活跃车辆

点击"活跃车辆"按钮，只显示引擎正在运行的车辆。

### 4. 查看调试信息

打开浏览器控制台（F12），输入：

```javascript
window.__SAMSARA_DEBUG__
```

可以看到所有原始数据。

## 📋 改进内容一览

### 之前 ❌

- 只检查 `engineStates`
- 如果 API 返回空数据就无法判断
- 无法获取详细车辆信息

### 现在 ✅

- 使用 4 种方法判断车辆活跃状态
- 获取 7 种车辆状态信息
- 即使某个状态缺失也能正常工作
- 有完整的工具函数和文档

## 🔧 核心改进

### 1. 更全面的 API 调用

```typescript
// 之前
types=obdDriver,fuelPerc,engineStates

// 现在
types=engineStates,obdDriver,fuelPercents,ecuSpeedMph,obdOdometerMeters,engineRpm,gps
```

### 2. 多维度判断

现在使用 4 种方法判断车辆是否活跃：

1. ✅ **引擎状态** - `On` 或 `Idle`
2. ✅ **发动机转速** - RPM > 0
3. ✅ **车速** - 速度 > 0
4. ✅ **OBD 司机** - 有司机信息

### 3. 新的工具函数

```typescript
import { getActiveVehicleIds, extractVehicleStatus } from "@/lib/vehicle-status";

// 获取活跃车辆 ID
const activeIds = getActiveVehicleIds(vehicleStats);

// 获取详细状态
const status = extractVehicleStatus(stat);
console.log(status.engineState, status.rpm, status.speed);
```

## 📊 数据结构

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

## 💡 使用示例

### 示例 1: 获取活跃车辆

```typescript
import { getActiveVehicleIds } from "@/lib/vehicle-status";

const result = await fetchSamsaraData();
const activeIds = getActiveVehicleIds(result.vehicleStats);

console.log(`找到 ${activeIds.size} 辆活跃车辆`);
```

### 示例 2: 显示车辆详细状态

```typescript
import { extractVehicleStatus, formatVehicleStatus } from "@/lib/vehicle-status";

result.vehicleStats.forEach(stat => {
  const status = extractVehicleStatus(stat);
  
  if (status.isActive) {
    const formatted = formatVehicleStatus(status);
    console.log(`${status.name}: ${formatted}`);
  }
});

// 输出:
// BIN#1: 状态: On | 1500 RPM | 45.5 mph | 燃油: 75% | 司机: John Doe
```

### 示例 3: 筛选特定状态的车辆

```typescript
// 找出所有怠速的车辆
const idleVehicles = result.vehicleStats
  .map(extractVehicleStatus)
  .filter(status => status.engineState === 'Idle');

console.log(`${idleVehicles.length} 辆车正在怠速`);

// 找出所有正在行驶的车辆
const movingVehicles = result.vehicleStats
  .map(extractVehicleStatus)
  .filter(status => status.speed && status.speed > 0);

console.log(`${movingVehicles.length} 辆车正在行驶`);
```

## 🔍 调试技巧

### 1. 查看控制台日志

同步时会输出详细日志：

```
🚗 活跃车辆: BIN#1 (状态: On, 1500 RPM, 45 mph, 司机: John Doe)
🚗 活跃车辆: FLAT#2 (状态: Idle, 800 RPM, 0 mph)
📊 找到 2 辆活跃车辆
```

### 2. 检查原始数据

```javascript
// 在浏览器控制台
const debug = window.__SAMSARA_DEBUG__;

// 查看车辆状态
console.table(debug.sStats);

// 查看第一辆车的详细信息
console.log(debug.sStats[0]);
```

### 3. 测试单个车辆

```typescript
// 测试特定车辆的状态判断
const testVehicle = vehicleStats.find(s => s.name === 'BIN#1');
const status = extractVehicleStatus(testVehicle);

console.log('车辆状态:', status);
console.log('是否活跃:', status.isActive);
console.log('判断依据:', {
  engineState: status.engineState,
  rpm: status.rpm,
  speed: status.speed,
  hasDriver: status.hasDriver
});
```

## ⚠️ 常见问题

### Q: 同步后没有活跃车辆？

**可能原因：**
1. 所有车辆的引擎都关闭了
2. API 返回的数据不完整
3. 车辆没有安装 OBD 设备

**解决方法：**
1. 运行 `node test-vehicle-stats.js` 检查 API
2. 查看控制台日志确认数据
3. 检查 `window.__SAMSARA_DEBUG__.sStats`

### Q: 某些车辆状态显示 "Unknown"？

**原因：** 车辆没有 `engineStates` 数据

**解决方法：** 系统会自动使用其他指标（rpm, speed）判断，不影响功能。

### Q: 同步失败？

**检查清单：**
- ✅ API Token 是否正确
- ✅ Token 是否有 "Read Vehicle Statistics" 权限
- ✅ 网络连接是否正常
- ✅ 查看控制台错误信息

## 📚 完整文档

- **VEHICLE_SYNC_SUMMARY.md** - 改进总结
- **VEHICLE_STATUS_SYNC_IMPROVEMENTS.md** - 技术细节
- **VEHICLE_STATUS_USAGE_EXAMPLES.md** - 更多示例
- **SAMSARA_STATS_API_REFERENCE.md** - API 参考

## 🎯 下一步

### 基础使用

1. ✅ 测试 API 连接
2. ✅ 在车队页面同步
3. ✅ 查看活跃车辆

### 进阶使用

1. 📖 阅读 `VEHICLE_STATUS_USAGE_EXAMPLES.md`
2. 🔧 自定义车辆状态判断逻辑
3. 📊 添加车辆健康监控
4. 📈 记录历史数据分析

### 开发扩展

1. 💻 查看 `src/lib/vehicle-status.ts` 源码
2. 🛠️ 修改 `extractVehicleStatus` 函数
3. 🧪 添加单元测试
4. 📝 更新文档

## 💬 需要帮助？

1. 查看完整文档（上面列出的 4 个文档）
2. 运行测试脚本 `node test-vehicle-stats.js`
3. 检查浏览器控制台日志
4. 查看 `window.__SAMSARA_DEBUG__` 原始数据

## ✨ 总结

通过这次改进，车辆状态同步功能：

- ✅ 更准确 - 4 种判断方法
- ✅ 更全面 - 7 种状态信息
- ✅ 更可靠 - 容错能力强
- ✅ 更易用 - 完整工具函数

现在就开始使用吧！🚀
