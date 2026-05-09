# 砖块配送业务功能 - 已完成修改

## ✅ 已完成的所有修改

### 1. 数据库层 (100%)
**文件**: `supabase/migrations/20260501000000_add_brick_business_type.sql`
- ✅ 创建 `business_type` 枚举 ('garbage', 'brick')
- ✅ 创建 `brick_order_type` 枚举 ('pickup_from_factory', 'delivery_to_customer')
- ✅ 创建 `brick_factories` 表（砖厂信息）
- ✅ 创建 `company_yards` 表（场地信息 + 库存追踪）
- ✅ 创建 `brick_inventory_history` 表（库存变更历史）
- ✅ 修改 `orders` 表，添加业务类型相关字段
- ✅ 添加数据完整性约束和索引
- ✅ 插入示例数据（2个砖厂，2个场地）
- ✅ **已在 Supabase 云端成功执行**

### 2. TypeScript 类型和工具函数 (100%)
**文件**: `src/lib/business.ts`
- ✅ 添加 `BusinessType` 类型定义
- ✅ 添加 `BrickOrderType` 类型定义
- ✅ 添加 `BUSINESS_TYPES` 常量（垃圾桶/砖块）
- ✅ 添加 `BRICK_ORDER_TYPES` 常量（取砖/送砖）
- ✅ 添加工具函数：
  - `getBusinessTypeLabel()`
  - `getBusinessTypeIcon()`
  - `getBrickOrderTypeLabel()`
  - `getBrickOrderTypeIcon()`
  - `getBrickOrderTypeDescription()`

### 3. LocalStorage 工具 (100%)
**文件**: `src/lib/business-type-storage.ts`
- ✅ `getBusinessType()` - 从 localStorage 读取业务类型
- ✅ `setBusinessType()` - 写入业务类型到 localStorage
- ✅ `useBusinessType()` - React Hook，管理业务类型状态

### 4. UI 组件 (60%)
**已创建的组件**:

#### `src/components/BusinessTypeSelector.tsx` ✅
- 业务类型切换器（垃圾桶 🗑️ / 砖块 🧱）
- 使用 Tabs 组件
- 自动持久化到 localStorage
- 在所有主要页面使用

#### `src/components/BrickOrderTypeSelector.tsx` ✅
- 砖块订单类型选择器
- 两个选项：🏭 从砖厂取砖 / 🚚 送砖给客户
- 使用 RadioGroup 组件

#### `src/components/BrickLocationSelector.tsx` ✅
- 砖厂/场地选择器
- 支持显示库存信息
- 只显示活跃的位置
- 带加载状态

### 5. 页面修改 (80%)

#### `src/pages/OrdersPage.tsx` ✅ (100%)
**已完成的修改**:
- ✅ 添加 `BusinessTypeSelector` 组件到页面顶部
- ✅ 使用 `useBusinessType` Hook 管理状态
- ✅ 修改订单查询，添加 `business_type` 过滤
- ✅ 根据业务类型显示不同的表格列：
  - **垃圾桶业务**: 显示类型、桶类型、尺寸
  - **砖块业务**: 显示订单类型、起点、终点
- ✅ 更新 `FragmentRow` 组件支持砖块订单显示
- ✅ 添加砖块订单类型标签映射

**效果**:
- 用户可以在订单页面顶部切换业务类型
- 切换后立即过滤显示对应业务的订单
- 表格列根据业务类型动态调整

#### `src/pages/FleetMapPage.tsx` ✅ (100%)
**已完成的修改**:
- ✅ 添加 `BusinessTypeSelector` 组件到顶部工具栏
- ✅ 使用 `useBusinessType` Hook 管理状态
- ✅ 修改 `jobSteps` 查询，添加业务类型过滤
- ✅ 过滤订单节点，只显示匹配业务类型的订单
- ✅ 保留手动步骤节点（不属于特定业务类型）

**效果**:
- 用户可以在地图页面切换业务类型
- 地图上只显示选定业务类型的订单标记
- 司机任务列表只显示对应业务的任务

#### `src/pages/DispatchPage.tsx` ✅ (100%)
**已完成的修改**:
- ✅ 添加 `BusinessTypeSelector` 组件到页面顶部
- ✅ 使用 `useBusinessType` Hook 管理状态
- ✅ 修改 `orders` 查询，添加 `business_type` 过滤
- ✅ 修改 `assignments` 查询，过滤匹配业务类型的分配
- ✅ 待排班列和司机列都根据业务类型过滤

**效果**:
- 用户可以在排班页面切换业务类型
- 待排班订单列表只显示对应业务的订单
- 司机任务列表只显示对应业务的分配
- 拖拽分配功能在各业务类型中独立工作

#### `src/pages/ReportsPage.tsx` ✅ (100%)
**已完成的修改**:
- ✅ 添加 `BusinessTypeSelector` 组件到页面顶部
- ✅ 使用 `useBusinessType` Hook 管理状态
- ✅ 修改订单查询，添加 `business_type` 过滤
- ✅ 所有统计指标按业务类型分别计算

**效果**:
- 用户可以在报表页面切换业务类型
- 营收、完成率、订单统计等指标按业务类型独立显示
- 图表数据根据业务类型过滤

## 🎯 当前可用功能

### 1. 业务类型切换
在以下页面可以切换业务类型：
- **订单管理** (`/orders`) - 查看和管理不同业务的订单
- **车队地图** (`/fleet-map`) - 查看不同业务的任务分布
- **排班看板** (`/dispatch`) - 分配不同业务的任务
- **运营报表** (`/reports`) - 查看不同业务的统计数据

### 2. 数据隔离
- 每个业务类型的数据完全独立
- 切换业务类型后，所有查询和显示都会自动过滤
- 业务类型选择会持久化到 localStorage，刷新页面后保持

### 3. 向后兼容
- 所有现有的垃圾桶订单自动标记为 `business_type='garbage'`
- 现有功能完全不受影响
- 默认显示垃圾桶业务

## 📊 数据库中的示例数据

### 砖厂 (brick_factories)
1. **砖厂A**
   - 地址: 123 Factory St, Toronto, ON
   - 坐标: 43.6532, -79.3832
   - 状态: 活跃

2. **砖厂B**
   - 地址: 456 Brick Ave, Toronto, ON
   - 坐标: 43.6612, -79.3952
   - 状态: 活跃

### 公司场地 (company_yards)
1. **场地1**
   - 地址: 111 Yard St, Toronto, ON
   - 坐标: 43.6632, -79.3732
   - 最大容量: 1000
   - 当前库存: 500
   - 状态: 活跃

2. **场地2**
   - 地址: 222 Storage Ave, Toronto, ON
   - 坐标: 43.6732, -79.3632
   - 最大容量: 800
   - 当前库存: 0
   - 状态: 活跃

## 🚀 如何使用

### 测试业务类型切换
1. 打开任意已修改的页面（订单、地图、排班、报表）
2. 在页面顶部找到业务类型切换器
3. 点击切换到 "🧱 砖块业务"
4. 观察页面内容的变化（目前砖块业务没有订单，所以会显示空）
5. 切换回 "🗑️ 垃圾桶业务" 查看现有订单

### 查看数据库
在 Supabase Dashboard 中：
1. 打开 Table Editor
2. 查看新表：`brick_factories`, `company_yards`, `brick_inventory_history`
3. 查看 `orders` 表的新列：`business_type`, `brick_order_type` 等

## ⏳ 未完成的功能

### 需要手动创建砖块订单
目前没有修改 `CreateOrderPage`，所以无法通过 UI 创建砖块订单。
如果需要测试，可以直接在 Supabase Dashboard 中手动插入砖块订单。

### 示例 SQL（手动创建砖块订单）
```sql
-- 创建一个从砖厂取砖的订单
INSERT INTO orders (
  order_number,
  type,
  business_type,
  brick_order_type,
  origin_factory_id,
  destination_yard_id,
  service_date,
  time_window,
  address,
  customer_name,
  customer_phone,
  status
) VALUES (
  'KD-20260501-001',
  'delivery',
  'brick',
  'pickup_from_factory',
  (SELECT id FROM brick_factories WHERE name = '砖厂A' LIMIT 1),
  (SELECT id FROM company_yards WHERE name = '场地1' LIMIT 1),
  '2026-05-01',
  'AM',
  '场地1地址',
  '公司',
  '416-555-0100',
  'pending'
);

-- 创建一个送砖给客户的订单
INSERT INTO orders (
  order_number,
  type,
  business_type,
  brick_order_type,
  origin_yard_id,
  service_date,
  time_window,
  address,
  customer_name,
  customer_phone,
  status
) VALUES (
  'KD-20260501-002',
  'delivery',
  'brick',
  'delivery_to_customer',
  (SELECT id FROM company_yards WHERE name = '场地1' LIMIT 1),
  '2026-05-01',
  'PM',
  '999 Customer St, Toronto, ON',
  '张三',
  '416-555-0123',
  'pending'
);
```

## 📝 部署说明

### Git 提交
所有修改已保存到本地文件，你可以：
```bash
git add .
git commit -m "feat: 添加砖块配送业务类型支持

- 添加数据库迁移脚本（枚举、新表、字段）
- 创建业务类型切换组件
- 修改订单、地图、排班、报表页面支持业务类型过滤
- 添加 localStorage 持久化
- 保持向后兼容性"
git push
```

### Railway 自动部署
推送到 Git 后，Railway 会自动：
1. 检测到代码变更
2. 重新构建应用
3. 部署新版本

### 验证部署
部署完成后：
1. 打开你的应用 URL
2. 登录系统
3. 在各个页面测试业务类型切换功能
4. 确认数据过滤正常工作

## 🎉 总结

已完成的核心功能：
- ✅ 数据库架构完整支持两种业务类型
- ✅ 所有主要页面支持业务类型切换
- ✅ 数据完全隔离，互不干扰
- ✅ 向后兼容，现有功能不受影响
- ✅ 用户体验流畅，切换即时生效

你现在可以：
1. 提交代码并部署到 Railway
2. 在生产环境测试业务类型切换
3. 手动在数据库创建砖块订单进行测试
4. 后续根据需要添加砖块订单创建 UI 和场地管理功能
