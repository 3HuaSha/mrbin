# 🗺️ ETA地图可视化功能

## 功能概述

在实时地图上可视化显示司机的任务路线和预计到达时间（ETA），包括：
1. **包含手动步骤**：ETA计算现在包含手动步骤（取桶、放桶、倒垃圾）的地址
2. **路线可视化**：在地图上绘制从车辆当前位置到各个任务点的连线
3. **ETA显示**：在每个任务点的标记上显示预计到达时间

## 修改内容

### 1. FleetMapPage.tsx - ETA计算逻辑

#### 修改前
```typescript
// 只计算订单节点
const orderSteps = driverSteps.filter(s => s.node_type === 'order' && s.orders);
const ordersForETA = orderSteps.map(s => ({
  id: s.orders!.id,
  address: s.orders!.address,
}));
```

#### 修改后
```typescript
// 包含所有步骤（订单节点 + 手动步骤节点）
const allSteps = driverSteps.map(s => {
  if (s.node_type === 'order' && s.orders) {
    return {
      id: s.orders.id,
      address: s.orders.address,
      type: 'order' as const,
      stepNumber: s.step_number
    };
  } else if (s.node_type === 'step' && s.location) {
    return {
      id: s.id,
      address: s.location,
      type: 'manual' as const,
      stepNumber: s.step_number
    };
  }
  return null;
}).filter(Boolean).sort((a, b) => a!.stepNumber - b!.stepNumber);

const stepsForETA = allSteps.map(s => ({
  id: s!.id,
  address: s!.address,
}));
```

**改进**：
- ✅ 现在ETA计算包含手动步骤的地址
- ✅ 按照step_number排序，确保路线顺序正确
- ✅ 支持订单节点和手动步骤节点混合排序

### 2. DispatchMapWidget.tsx - 地图可视化

#### 新增功能

**A. 路线绘制**
```typescript
// 新增 routeLinesRef 存储路线折线
const routeLinesRef = useRef<any[]>([]);

// 新增 effect 绘制ETA路线
useEffect(() => {
  // 清除旧路线
  routeLinesRef.current.forEach(line => line.setMap(null));
  routeLinesRef.current = [];
  
  // 为每个有ETA数据的司机绘制路线
  Object.values(driverETAs).forEach((driverETA: any) => {
    // 构建路径：车辆位置 -> 任务点1 -> 任务点2 -> ...
    const pathCoordinates = [
      { lat: driverETA.currentLocation.lat, lng: driverETA.currentLocation.lng }
    ];
    
    driverETA.orders.forEach((orderETA: any) => {
      const marker = markersRef.current[`order_${orderETA.orderId}`];
      if (marker && marker.getPosition) {
        const pos = marker.getPosition();
        pathCoordinates.push({ lat: pos.lat(), lng: pos.lng() });
      }
    });
    
    // 绘制折线
    const routeLine = new google.maps.Polyline({
      path: pathCoordinates,
      strokeColor: lineColor,
      strokeOpacity: 0.8,
      strokeWeight: 4,
      map: mapInstance.current
    });
    
    routeLinesRef.current.push(routeLine);
  });
}, [driverETAs, mapLoaded]);
```

**特点**：
- 🎨 不同司机使用不同颜色的路线
- 📍 路线按任务顺序连接
- 🔄 ETA更新时自动重绘路线

**B. ETA标记显示**
```typescript
// 修改订单图标，添加ETA行
function createOrderIconWithLabel(order: any, orderETA?: any): string {
  const lines = [line1, line2];
  
  // 如果有ETA，添加ETA行
  if (orderETA && orderETA.status === 'OK') {
    const etaTime = new Date(orderETA.eta).toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    lines.push(`ETA: ${etaTime}`);
  }
  
  // ETA行使用金色高亮
  const isETALine = line.startsWith('ETA:');
  const fill = isETALine ? '#FFD700' : scheme.text;
}
```

**特点**：
- ⏰ ETA时间显示在标记底部
- 🌟 ETA文字使用金色高亮
- 📊 格式：`ETA: 14:30`

## 使用流程

### 1. 打开实时地图页面
导航到：**实时车队地图** (`/staff/map`)

### 2. 选择日期
在左侧面板选择要查看的日期

### 3. 计算ETA
点击司机名称旁边的 **⏰ 时钟图标** 按钮

### 4. 查看可视化结果

**地图上会显示**：
- 🚛 **车辆当前位置**：带司机名称的车辆图标
- 📍 **任务点标记**：显示订单信息和ETA时间
- 🔗 **路线连线**：从车辆到各个任务点的彩色折线
- ⏰ **ETA时间**：每个任务点标记上显示预计到达时间

**左侧列表会显示**：
- 每个任务的详细信息
- 订单节点显示ETA时间（蓝色标签）

## 示例场景

### 场景1：司机有3个订单 + 1个手动步骤

**任务顺序**：
1. 订单A - 123 Main St (送20yd垃圾桶)
2. 手动步骤 - 3445 (倒垃圾)
3. 订单B - 456 Oak Ave (收14yd砖桶)
4. 订单C - 789 Pine Rd (换30yd土桶)

**地图显示**：
```
🚛 车辆 (当前位置)
  ↓ (蓝色线)
📍 订单A - ETA: 09:15
  ↓ (蓝色线)
📍 3445 - ETA: 09:45
  ↓ (蓝色线)
📍 订单B - ETA: 10:20
  ↓ (蓝色线)
📍 订单C - ETA: 11:00
```

### 场景2：多个司机同时显示

**司机1**：蓝色路线
**司机2**：绿色路线
**司机3**：橙色路线

每个司机的路线用不同颜色区分，清晰可见。

## 技术细节

### 路线颜色方案
```typescript
const colors = [
  '#2196F3', // 蓝色
  '#4CAF50', // 绿色
  '#FF9800', // 橙色
  '#9C27B0', // 紫色
  '#F44336', // 红色
  '#00BCD4'  // 青色
];
```

### ETA时间格式
- **显示格式**：24小时制，例如 `14:30`
- **计算方式**：基于Samsara Routes API的实时路况
- **更新频率**：手动点击计算按钮

### 路线绘制参数
```typescript
{
  geodesic: true,        // 使用大地测量线
  strokeOpacity: 0.8,    // 80%不透明度
  strokeWeight: 4,       // 4像素宽度
  zIndex: 100           // 在标记下方
}
```

## 性能优化

1. **路线缓存**：使用 `routeLinesRef` 存储路线对象，避免重复创建
2. **智能更新**：只在 `driverETAs` 变化时重绘路线
3. **清理机制**：重绘前清除旧路线，防止内存泄漏

## 已知限制

1. **手动步骤地址**：手动步骤的地址需要是有效的地址字符串（如"3445", "york1 300"）
2. **地址解析**：如果地址无法解析，该点不会显示在地图上
3. **路线精度**：路线是直线连接，不是实际道路路径（Samsara API提供的是总体路线，不是详细路径）

## 未来改进

- [ ] 显示每段路线的预计时长
- [ ] 支持实时路况更新
- [ ] 添加路线优化建议
- [ ] 支持手动调整任务顺序并重新计算ETA
- [ ] 显示历史ETA准确度统计

## 相关文件

- `src/pages/FleetMapPage.tsx` - 实时地图页面（已修改）
- `src/components/DispatchMapWidget.tsx` - 地图组件（已修改）
- `src/lib/eta-calculator.ts` - ETA计算逻辑
- `src/actions/samsara.ts` - Samsara API调用

## 部署

代码已修改完成，准备部署：

```bash
git add .
git commit -m "feat: 添加ETA地图可视化，包含手动步骤和路线绘制"
git push
```

Railway 会自动部署更新。
