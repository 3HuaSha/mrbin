# 砖块配送业务功能实现状态

## ✅ 已完成的工作

### 1. 数据库层 (100% 完成)
- ✅ 创建了完整的数据库迁移脚本 (`supabase/migrations/20260501000000_add_brick_business_type.sql`)
- ✅ 创建了 `business_type` 和 `brick_order_type` 枚举
- ✅ 创建了 3 个新表：
  - `brick_factories` - 砖厂信息
  - `company_yards` - 公司场地（含库存追踪）
  - `brick_inventory_history` - 库存变更历史
- ✅ 修改了 `orders` 表，添加了业务类型相关字段
- ✅ 添加了数据完整性约束和索引
- ✅ 插入了示例数据（2个砖厂，2个场地）
- ✅ 已在 Supabase 云端执行成功

### 2. TypeScript 类型和工具函数 (100% 完成)
- ✅ 在 `src/lib/business.ts` 添加了：
  - `BusinessType` 类型定义
  - `BrickOrderType` 类型定义
  - `BUSINESS_TYPES` 常量
  - `BRICK_ORDER_TYPES` 常量
  - `getBusinessTypeLabel()` 函数
  - `getBusinessTypeIcon()` 函数
  - `getBrickOrderTypeLabel()` 函数
  - `getBrickOrderTypeIcon()` 函数
  - `getBrickOrderTypeDescription()` 函数

### 3. LocalStorage 工具 (100% 完成)
- ✅ 创建了 `src/lib/business-type-storage.ts`
  - `getBusinessType()` - 从 localStorage 读取
  - `setBusinessType()` - 写入 localStorage
  - `useBusinessType()` - React Hook

### 4. UI 组件 (75% 完成)
- ✅ `BusinessTypeSelector` - 业务类型切换器（垃圾桶/砖块）
- ✅ `BrickOrderTypeSelector` - 砖块订单类型选择器（取砖/送砖）
- ✅ `BrickLocationSelector` - 砖厂/场地选择器（带库存显示）
- ⏳ `InventoryHistoryDialog` - 库存历史对话框（未创建）
- ⏳ `ManualInventoryAdjustmentDialog` - 手动库存调整对话框（未创建）

### 5. 页面修改 (25% 完成)
- ✅ `OrdersPage` - 已添加业务类型切换器和过滤功能
  - 添加了 BusinessTypeSelector 组件
  - 根据业务类型显示不同的表格列
  - 砖块业务显示：订单类型、起点、终点
  - 垃圾桶业务显示：桶号、尺寸、桶类型
- ⏳ `FleetMapPage` - 需要添加业务类型切换和砖厂/场地标记
- ⏳ `DispatchPage` - 需要添加业务类型切换
- ⏳ `CreateOrderPage` - 需要添加砖块订单创建功能
- ⏳ `ReportsPage` - 需要添加业务类型过滤
- ⏳ `BrickLocationsPage` - 新页面，管理砖厂和场地（未创建）

## 🔄 待完成的工作

### 高优先级

#### 1. 完成 CreateOrderPage 修改
需要添加：
- 业务类型选择器
- 当选择"砖块业务"时：
  - 显示砖块订单类型选择器（取砖/送砖）
  - 根据订单类型显示不同的表单字段
  - 从砖厂取砖：砖厂选择器 + 场地选择器
  - 送砖给客户：场地选择器（带库存显示）+ 客户地址输入
  - 隐藏桶相关字段
  - 添加库存验证

#### 2. 修改 FleetMapPage
需要添加：
- BusinessTypeSelector 组件
- 当业务类型为"砖块"时：
  - 显示砖厂标记（蓝色工厂图标）
  - 显示场地标记（绿色仓库图标）
  - 点击场地标记显示库存信息
- 更新 DispatchMapWidget 组件支持新标记类型

#### 3. 修改 DispatchPage
需要添加：
- BusinessTypeSelector 组件
- 根据业务类型过滤任务
- 显示砖块订单的起点和终点信息

### 中优先级

#### 4. 创建 BrickLocationsPage
新页面，包含：
- 砖厂管理区域（列表、添加、编辑、激活/停用）
- 场地管理区域（列表、添加、编辑、激活/停用、库存显示）
- 库存历史查看功能
- 手动库存调整功能

#### 5. 创建库存管理组件
- `InventoryHistoryDialog` - 显示库存变更历史
- `ManualInventoryAdjustmentDialog` - 手动调整库存

#### 6. 修改 ReportsPage
- 添加业务类型过滤器
- 按业务类型分别统计指标

### 低优先级

#### 7. 库存管理逻辑
创建 `src/lib/inventory.ts`：
- `incrementInventory()` - 增加库存
- `decrementInventory()` - 减少库存
- `manualAdjustInventory()` - 手动调整
- `validateInventory()` - 验证库存

#### 8. 数据库触发器更新
修改触发器以支持砖块业务：
- 更新 `create_job_steps_for_assignment()` 
- 更新 `on_step_completed()` 添加库存更新逻辑

#### 9. 司机应用支持
修改司机端页面：
- 显示业务类型
- 砖块任务的特殊完成要求

## 📝 使用说明

### 当前可用功能

1. **查看订单（按业务类型）**
   - 打开订单管理页面
   - 使用顶部的业务类型切换器
   - 切换到"砖块业务"查看砖块订单（目前为空）
   - 切换到"垃圾桶业务"查看现有订单

2. **数据库中的示例数据**
   - 2个砖厂：砖厂A、砖厂B
   - 2个场地：场地1（库存500）、场地2（库存0）

### 下一步操作建议

**选项 1：继续手动实现**
我可以继续逐个实现剩余的页面和组件。

**选项 2：分阶段测试**
先完成 CreateOrderPage，让你能够创建砖块订单，然后再实现其他功能。

**选项 3：使用自动化工具**
使用任务系统让子代理并行实现剩余功能。

## 🎯 快速开始下一步

如果你想继续实现，我建议按以下顺序：

1. **CreateOrderPage** - 让你能创建砖块订单
2. **FleetMapPage** - 在地图上看到砖厂和场地
3. **BrickLocationsPage** - 管理砖厂和场地
4. **DispatchPage** - 分配砖块任务给司机
5. **库存管理** - 完整的库存追踪功能

你想让我继续实现哪个部分？
