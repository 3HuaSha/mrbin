# 实时地图页面改进说明

## 修改概述

已成功修改实时地图页面（FleetMapPage）左侧的司机任务卡片，使其样式与排班页面完全一致。

## 主要改动

### 1. 数据源变更

**之前：**
- 从 `dispatch_assignments` 表获取数据
- 只显示订单任务

**现在：**
- 从 `job_steps` 表获取数据（统一的任务步骤表）
- 同时显示订单节点和手动步骤节点
- 按 `step_number` 排序，保持与排班页面一致

### 2. 卡片样式完全统一

#### 订单节点卡片（蓝色左边框）
```css
className="relative rounded-lg border-l-4 border-l-blue-500 bg-card shadow-md p-2.5 transition-all duration-300 hover:shadow-xl"
```

**显示内容：**
- 订单类型 emoji + 标签 + 桶尺寸 + 桶类型（text-xs font-semibold）
- 地址（text-[10px] text-muted-foreground）
- 时段（text-[10px] text-primary font-medium）
- 客户备注（如果有，text-[9px] text-status-progress）

#### 手动步骤节点卡片（灰色左边框）
```css
className="relative rounded-lg border-l-4 border-l-gray-400 bg-card/80 shadow-sm p-2 transition-all duration-300 hover:shadow-lg"
```

**显示内容：**
- "手动步骤"标签（Badge variant="outline" text-[8px]）
- 步骤类型（text-[11px] font-semibold）
- 地点（text-[9px] text-muted-foreground，带 MapPin 图标）
- 桶ID（如果有，text-[9px] text-primary）
- 备注（如果有，text-[8px] text-muted-foreground）

### 3. 样式细节对比

| 元素 | 排班页面 | 实时地图页面 | 状态 |
|------|---------|-------------|------|
| 订单卡片边框 | `border-l-4 border-l-blue-500` | `border-l-4 border-l-blue-500` | ✅ 一致 |
| 订单卡片背景 | `bg-card shadow-md` | `bg-card shadow-md` | ✅ 一致 |
| 订单卡片内边距 | `p-2.5` | `p-2.5` | ✅ 一致 |
| 订单标题字体 | `text-xs font-semibold` | `text-xs font-semibold` | ✅ 一致 |
| 步骤卡片边框 | `border-l-4 border-l-gray-400` | `border-l-4 border-l-gray-400` | ✅ 一致 |
| 步骤卡片背景 | `bg-card/80 shadow-sm` | `bg-card/80 shadow-sm` | ✅ 一致 |
| 步骤卡片内边距 | `p-2` | `p-2` | ✅ 一致 |
| Hover 效果 | `hover:shadow-xl` / `hover:shadow-lg` | `hover:shadow-xl` / `hover:shadow-lg` | ✅ 一致 |

### 4. 地图标记逻辑

**重要：** 手动步骤不会在地图上显示标记

- 只有订单节点（`node_type === 'order'`）会在地图上显示
- 手动步骤只在左侧卡片列表中显示
- 地图组件通过过滤 `jobSteps` 来提取订单，确保只显示订单标记

## 技术实现

### 数据查询
```typescript
const { data: jobSteps = [] } = useQuery({
  queryKey: ["map-job-steps", date],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("job_steps")
      .select("*, orders(*)")
      .eq("scheduled_date", date)
      .order("step_number");
    if (error) throw error;
    return (data ?? []) as unknown as JobStep[];
  },
});
```

### 订单提取（用于地图显示）
```typescript
const orders = useMemo(() => {
  const uniqueOrders = new Map<string, Order>();
  jobSteps.forEach(step => {
    if (step.node_type === 'order' && step.orders) {
      uniqueOrders.set(step.orders.id, step.orders);
    }
  });
  return Array.from(uniqueOrders.values());
}, [jobSteps]);
```

### 按司机分组
```typescript
const driverJobSteps = useMemo(() => {
  const map: Record<string, JobStep[]> = {};
  for (const step of jobSteps) {
    (map[step.driver_id] ??= []).push(step);
  }
  return map;
}, [jobSteps]);
```

## 用户体验改进

1. **完全一致**：实时地图和排班页面的卡片样式现在完全相同
2. **视觉统一**：
   - 相同的圆角、边框、阴影效果
   - 相同的字体大小和颜色
   - 相同的间距和布局
   - 相同的 hover 动画效果
3. **信息完整**：司机可以在实时地图上看到所有任务，包括手动步骤
4. **清晰区分**：
   - 订单节点用蓝色左边框标识
   - 手动步骤用灰色左边框标识
5. **地图简洁**：手动步骤不在地图上显示，避免地图过于拥挤

## 兼容性

- 保持了与现有地图组件（`DispatchMapWidget`）的兼容性
- 通过 `assignments` 变量提供向后兼容的数据格式
- 不影响其他使用 `DispatchMapWidget` 的页面

## 测试建议

1. 在排班页面添加订单和手动步骤
2. 切换到实时地图页面
3. 验证：
   - 左侧卡片样式与排班页面完全一致
   - 订单卡片显示完整信息（类型、尺寸、桶类型、时段、地址、备注）
   - 手动步骤卡片显示完整信息（类型、地点、备注）
   - 地图上只显示订单标记，不显示手动步骤标记
   - 步骤按正确顺序排列
   - Hover 效果正常工作

## 相关文件

- `src/pages/FleetMapPage.tsx` - 实时地图页面（已修改）
- `src/pages/DispatchPage.tsx` - 排班页面（样式参考源）
- `src/components/DispatchMapWidget.tsx` - 地图组件（未修改）
- `supabase/migrations/20260430000000_add_manual_steps_system.sql` - 手动步骤数据库结构
