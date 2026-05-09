# 实现任务列表

## Phase 1: 数据库架构变更

### Task 1.1: 创建业务类型枚举和修改 orders 表
- [ ] 创建 `business_type` 枚举类型 ('garbage', 'brick')
- [ ] 创建 `brick_order_type` 枚举类型 ('pickup_from_factory', 'delivery_to_customer')
- [ ] 在 `orders` 表添加 `business_type` 列，默认值 'garbage'
- [ ] 在 `orders` 表添加 `brick_order_type` 列（可空）
- [ ] 在 `orders` 表添加 `origin_factory_id` 列（外键到 brick_factories）
- [ ] 在 `orders` 表添加 `origin_yard_id` 列（外键到 company_yards）
- [ ] 在 `orders` 表添加 `destination_yard_id` 列（外键到 company_yards）
- [ ] 添加约束：砖块订单必须有 brick_order_type
- [ ] 添加约束：pickup_from_factory 订单必须有砖厂和目标场地
- [ ] 添加约束：delivery_to_customer 订单必须有起始场地
- [ ] 创建索引：idx_orders_business_type
- [ ] 创建索引：idx_orders_brick_order_type

### Task 1.2: 创建 brick_factories 表
- [ ] 创建 `brick_factories` 表，包含字段：
  - id (UUID, 主键)
  - name (TEXT, 非空)
  - address (TEXT, 非空)
  - latitude (NUMERIC(10,7), 非空)
  - longitude (NUMERIC(10,7), 非空)
  - contact_name (TEXT)
  - contact_phone (TEXT)
  - notes (TEXT)
  - is_active (BOOLEAN, 默认 true)
  - created_at (TIMESTAMPTZ)
  - updated_at (TIMESTAMPTZ)
- [ ] 启用 RLS
- [ ] 创建 "open_all" 策略
- [ ] 创建索引：idx_brick_factories_active

### Task 1.3: 创建 company_yards 表
- [ ] 创建 `company_yards` 表，包含字段：
  - id (UUID, 主键)
  - name (TEXT, 非空)
  - address (TEXT, 非空)
  - latitude (NUMERIC(10,7), 非空)
  - longitude (NUMERIC(10,7), 非空)
  - max_capacity (INTEGER, 默认 1000)
  - current_inventory (INTEGER, 默认 0)
  - contact_name (TEXT)
  - contact_phone (TEXT)
  - notes (TEXT)
  - is_active (BOOLEAN, 默认 true)
  - created_at (TIMESTAMPTZ)
  - updated_at (TIMESTAMPTZ)
- [ ] 添加约束：库存不能为负
- [ ] 添加约束：库存不能超过最大容量
- [ ] 启用 RLS
- [ ] 创建 "open_all" 策略
- [ ] 创建索引：idx_company_yards_active

### Task 1.4: 创建 brick_inventory_history 表
- [ ] 创建 `brick_inventory_history` 表，包含字段：
  - id (UUID, 主键)
  - yard_id (UUID, 外键到 company_yards)
  - order_id (UUID, 外键到 orders, 可空)
  - change_type (TEXT, 非空)
  - quantity_change (INTEGER, 非空)
  - inventory_before (INTEGER, 非空)
  - inventory_after (INTEGER, 非空)
  - reason (TEXT)
  - created_by (UUID, 外键到 profiles)
  - created_at (TIMESTAMPTZ)
- [ ] 启用 RLS
- [ ] 创建 "open_all" 策略
- [ ] 创建索引：idx_brick_inventory_history_yard
- [ ] 创建索引：idx_brick_inventory_history_order
- [ ] 创建索引：idx_brick_inventory_history_created_at

### Task 1.5: 创建数据迁移脚本
- [ ] 创建迁移脚本文件：`20260501000000_add_brick_business_type.sql`
- [ ] 包含所有上述数据库变更
- [ ] 添加数据迁移：将现有订单的 business_type 设置为 'garbage'
- [ ] 测试迁移脚本在开发环境
- [ ] 创建回滚脚本（如需要）

### Task 1.6: 更新数据库触发器
- [ ] 修改 `create_job_steps_for_assignment()` 触发器函数
- [ ] 添加对 brick 业务类型的支持
- [ ] 为 pickup_from_factory 订单生成正确的任务步骤
- [ ] 为 delivery_to_customer 订单生成正确的任务步骤
- [ ] 修改 `on_step_completed()` 触发器函数
- [ ] 添加库存更新逻辑：完成 pickup_from_factory 订单时增加库存
- [ ] 添加库存更新逻辑：完成 delivery_to_customer 订单时减少库存
- [ ] 添加库存历史记录创建逻辑

## Phase 2: TypeScript 类型定义和工具函数

### Task 2.1: 更新 TypeScript 类型定义
- [ ] 在 `src/integrations/supabase/types.ts` 添加 `BusinessType` 类型
- [ ] 在 `src/integrations/supabase/types.ts` 添加 `BrickOrderType` 类型
- [ ] 在 `src/integrations/supabase/types.ts` 添加 `BrickFactory` 接口
- [ ] 在 `src/integrations/supabase/types.ts` 添加 `CompanyYard` 接口
- [ ] 在 `src/integrations/supabase/types.ts` 添加 `BrickInventoryHistory` 接口
- [ ] 更新 `Order` 接口，添加新字段

### Task 2.2: 创建业务逻辑工具函数
- [ ] 在 `src/lib/business.ts` 添加 `BUSINESS_TYPES` 常量
- [ ] 在 `src/lib/business.ts` 添加 `BRICK_ORDER_TYPES` 常量
- [ ] 在 `src/lib/business.ts` 添加 `getBusinessTypeLabel()` 函数
- [ ] 在 `src/lib/business.ts` 添加 `getBrickOrderTypeLabel()` 函数
- [ ] 在 `src/lib/business.ts` 添加 `getBrickOrderTypeIcon()` 函数

### Task 2.3: 创建 localStorage 工具函数
- [ ] 创建 `src/lib/business-type-storage.ts` 文件
- [ ] 实现 `getBusinessType()` 函数（从 localStorage 读取）
- [ ] 实现 `setBusinessType()` 函数（写入 localStorage）
- [ ] 实现 `useBusinessType()` 自定义 Hook

## Phase 3: UI 组件开发

### Task 3.1: 创建 BusinessTypeSelector 组件
- [ ] 创建 `src/components/BusinessTypeSelector.tsx` 文件
- [ ] 实现组件 UI（使用 Tabs 组件）
- [ ] 添加图标和标签：🗑️ 垃圾桶业务 / 🧱 砖块业务
- [ ] 实现 onChange 回调
- [ ] 集成 localStorage 持久化
- [ ] 添加组件样式
- [ ] 编写组件单元测试

### Task 3.2: 创建 BrickOrderTypeSelector 组件
- [ ] 创建 `src/components/BrickOrderTypeSelector.tsx` 文件
- [ ] 实现组件 UI（使用 RadioGroup 或 Tabs）
- [ ] 添加选项：🏭 从砖厂取砖 / 🚚 送砖给客户
- [ ] 实现 onChange 回调
- [ ] 添加组件样式
- [ ] 编写组件单元测试

### Task 3.3: 创建 BrickLocationSelector 组件
- [ ] 创建 `src/components/BrickLocationSelector.tsx` 文件
- [ ] 实现砖厂选择器（查询 brick_factories 表）
- [ ] 实现场地选择器（查询 company_yards 表）
- [ ] 添加库存信息显示（仅场地）
- [ ] 只显示 is_active=true 的位置
- [ ] 添加加载状态
- [ ] 添加错误处理
- [ ] 编写组件单元测试

### Task 3.4: 创建 InventoryHistoryDialog 组件
- [ ] 创建 `src/components/InventoryHistoryDialog.tsx` 文件
- [ ] 实现对话框 UI
- [ ] 查询并显示库存历史记录
- [ ] 显示时间、订单号、变更数量、变更后库存
- [ ] 添加分页或滚动加载
- [ ] 添加日期过滤
- [ ] 编写组件单元测试

### Task 3.5: 创建 ManualInventoryAdjustmentDialog 组件
- [ ] 创建 `src/components/ManualInventoryAdjustmentDialog.tsx` 文件
- [ ] 实现对话框 UI
- [ ] 添加数量输入字段（支持正负数）
- [ ] 添加原因说明字段（必填）
- [ ] 实现提交逻辑
- [ ] 调用 API 更新库存
- [ ] 创建库存历史记录
- [ ] 添加验证和错误处理
- [ ] 编写组件单元测试

## Phase 4: 页面修改

### Task 4.1: 修改 OrdersPage
- [ ] 在页面顶部添加 BusinessTypeSelector 组件
- [ ] 实现业务类型状态管理
- [ ] 修改订单查询，添加 business_type 过滤
- [ ] 当 business_type='brick' 时，修改表格列：
  - 添加 brick_order_type 列
  - 添加起点位置列
  - 添加终点位置列
  - 隐藏 bin_number, bin_size 列
- [ ] 当 business_type='garbage' 时，保持现有列
- [ ] 更新订单详情展开区域，显示砖块订单信息
- [ ] 测试页面功能

### Task 4.2: 修改 FleetMapPage
- [ ] 在页面顶部添加 BusinessTypeSelector 组件
- [ ] 实现业务类型状态管理
- [ ] 修改订单查询，添加 business_type 过滤
- [ ] 当 business_type='brick' 时：
  - 查询并显示砖厂标记（蓝色工厂图标）
  - 查询并显示公司场地标记（绿色仓库图标）
  - 显示客户地址标记（橙色客户图标）
  - 实现场地标记点击，显示库存信息
- [ ] 当 business_type='garbage' 时，保持现有标记
- [ ] 更新 DispatchMapWidget 组件以支持新标记类型
- [ ] 测试地图功能

### Task 4.3: 修改 DispatchPage
- [ ] 在页面顶部添加 BusinessTypeSelector 组件
- [ ] 实现业务类型状态管理
- [ ] 修改任务查询，添加 business_type 过滤
- [ ] 当 business_type='brick' 时：
  - 显示 brick_order_type
  - 显示起点和终点位置
  - 调整任务卡片布局
- [ ] 当 business_type='garbage' 时，保持现有显示
- [ ] 测试调度功能

### Task 4.4: 修改 CreateOrderPage
- [ ] 在页面顶部添加 BusinessTypeSelector 组件
- [ ] 实现业务类型状态管理
- [ ] 当 business_type='brick' 时：
  - 显示 BrickOrderTypeSelector 组件
  - 根据 brick_order_type 显示不同的位置选择器
  - pickup_from_factory: 显示砖厂选择器 + 场地选择器
  - delivery_to_customer: 显示场地选择器 + 客户地址输入
  - 隐藏 bin_size, bin_type 字段
  - 添加库存验证逻辑
  - 显示当前库存数量
- [ ] 当 business_type='garbage' 时，保持现有表单
- [ ] 实现订单提交逻辑
- [ ] 添加表单验证
- [ ] 测试订单创建功能

### Task 4.5: 修改 ReportsPage
- [ ] 在页面顶部添加 BusinessTypeSelector 组件
- [ ] 实现业务类型状态管理
- [ ] 修改报表查询，添加 business_type 过滤
- [ ] 分别计算每种业务类型的指标
- [ ] 更新图表和统计数据
- [ ] 测试报表功能

### Task 4.6: 创建 BrickLocationsPage
- [ ] 创建 `src/pages/BrickLocationsPage.tsx` 文件
- [ ] 实现页面布局（两个区域：砖厂管理 + 场地管理）
- [ ] 实现砖厂管理区域：
  - 显示砖厂列表表格
  - 添加新砖厂按钮和对话框
  - 编辑砖厂按钮和对话框
  - 激活/停用砖厂切换按钮
  - 删除砖厂按钮（带引用检查）
- [ ] 实现场地管理区域：
  - 显示场地列表表格
  - 显示当前库存数量
  - 添加新场地按钮和对话框
  - 编辑场地按钮和对话框
  - 激活/停用场地切换按钮
  - 查看库存历史按钮
  - 手动调整库存按钮
  - 删除场地按钮（带引用检查）
- [ ] 集成 InventoryHistoryDialog 组件
- [ ] 集成 ManualInventoryAdjustmentDialog 组件
- [ ] 添加搜索和过滤功能
- [ ] 添加权限控制（仅 admin 和 manager）
- [ ] 测试页面功能

### Task 4.7: 添加路由配置
- [ ] 在 `src/routes/` 添加 `_staff.brick-locations.tsx` 路由文件
- [ ] 配置路由路径：`/brick-locations`
- [ ] 添加权限检查
- [ ] 在导航菜单添加链接（仅 admin 和 manager 可见）
- [ ] 测试路由导航

## Phase 5: 库存管理逻辑

### Task 5.1: 实现库存更新函数
- [ ] 创建 `src/lib/inventory.ts` 文件
- [ ] 实现 `incrementInventory()` 函数
  - 更新 company_yards.current_inventory
  - 创建库存历史记录
  - 使用事务确保原子性
- [ ] 实现 `decrementInventory()` 函数
  - 验证库存充足
  - 更新 company_yards.current_inventory
  - 创建库存历史记录
  - 使用事务确保原子性
- [ ] 实现 `manualAdjustInventory()` 函数
  - 更新 company_yards.current_inventory
  - 创建库存历史记录（包含原因）
  - 使用事务确保原子性
- [ ] 实现 `validateInventory()` 函数
  - 检查库存是否充足
  - 返回验证结果
- [ ] 编写单元测试

### Task 5.2: 集成库存更新到订单完成流程
- [ ] 修改数据库触发器 `on_step_completed()`
- [ ] 当 pickup_from_factory 订单完成时：
  - 调用 incrementInventory()
  - 传入 destination_yard_id 和订单信息
- [ ] 当 delivery_to_customer 订单完成时：
  - 调用 decrementInventory()
  - 传入 origin_yard_id 和订单信息
- [ ] 添加错误处理和日志记录
- [ ] 测试库存更新流程

### Task 5.3: 实现库存查询 API
- [ ] 创建 `src/actions/inventory.ts` 文件
- [ ] 实现 `getYardInventory()` 函数
- [ ] 实现 `getInventoryHistory()` 函数
- [ ] 实现 `getAllYardsInventory()` 函数
- [ ] 添加错误处理
- [ ] 编写单元测试

## Phase 6: 测试

### Task 6.1: 单元测试
- [ ] 测试 BusinessTypeSelector 组件
- [ ] 测试 BrickOrderTypeSelector 组件
- [ ] 测试 BrickLocationSelector 组件
- [ ] 测试库存管理函数
- [ ] 测试业务逻辑工具函数
- [ ] 确保测试覆盖率 > 80%

### Task 6.2: 集成测试
- [ ] 测试砖块订单创建流程
- [ ] 测试库存更新流程
- [ ] 测试业务类型过滤功能
- [ ] 测试并发库存更新
- [ ] 测试数据完整性约束

### Task 6.3: 端到端测试
- [ ] 测试完整砖块业务流程
- [ ] 测试业务类型切换流程
- [ ] 测试砖厂和场地管理流程
- [ ] 测试库存历史查询
- [ ] 测试手动库存调整

### Task 6.4: 数据迁移测试
- [ ] 在测试环境运行迁移脚本
- [ ] 验证现有订单正确迁移
- [ ] 验证现有功能不受影响
- [ ] 验证数据完整性
- [ ] 验证性能影响

### Task 6.5: 性能测试
- [ ] 测试按 business_type 过滤的查询性能
- [ ] 测试地图标记加载性能
- [ ] 测试库存历史查询性能
- [ ] 测试并发库存更新性能
- [ ] 优化慢查询

## Phase 7: 文档和部署

### Task 7.1: 更新用户文档
- [ ] 编写砖块业务功能使用指南
- [ ] 编写砖厂和场地管理指南
- [ ] 编写库存管理指南
- [ ] 更新系统操作手册
- [ ] 创建培训材料

### Task 7.2: 更新技术文档
- [ ] 更新数据库架构文档
- [ ] 更新 API 文档
- [ ] 更新组件文档
- [ ] 更新部署指南

### Task 7.3: 准备部署
- [ ] 在 staging 环境部署和测试
- [ ] 准备生产环境迁移脚本
- [ ] 准备回滚计划
- [ ] 通知相关团队
- [ ] 安排部署时间窗口

### Task 7.4: 生产环境部署
- [ ] 备份生产数据库
- [ ] 运行数据迁移脚本
- [ ] 部署前端代码
- [ ] 验证部署成功
- [ ] 监控系统运行状态
- [ ] 处理部署后问题

### Task 7.5: 用户培训和支持
- [ ] 组织用户培训会议
- [ ] 提供操作演示
- [ ] 收集用户反馈
- [ ] 解答用户问题
- [ ] 创建 FAQ 文档

## Phase 8: 监控和优化

### Task 8.1: 监控设置
- [ ] 设置业务类型使用情况监控
- [ ] 设置库存变更监控
- [ ] 设置错误率监控
- [ ] 设置性能监控
- [ ] 设置告警规则

### Task 8.2: 性能优化
- [ ] 分析慢查询
- [ ] 优化数据库索引
- [ ] 优化前端加载性能
- [ ] 优化地图渲染性能
- [ ] 实施缓存策略

### Task 8.3: 用户反馈收集和改进
- [ ] 收集用户反馈
- [ ] 分析使用数据
- [ ] 识别改进点
- [ ] 规划后续迭代
- [ ] 实施改进措施

## 依赖关系

- Phase 1 必须在所有其他阶段之前完成
- Phase 2 依赖 Phase 1
- Phase 3 依赖 Phase 2
- Phase 4 依赖 Phase 3
- Phase 5 依赖 Phase 1 和 Phase 2
- Phase 6 依赖 Phase 3, 4, 5
- Phase 7 依赖 Phase 6
- Phase 8 依赖 Phase 7

## 估计时间

- Phase 1: 2-3 天
- Phase 2: 1 天
- Phase 3: 3-4 天
- Phase 4: 5-6 天
- Phase 5: 2-3 天
- Phase 6: 3-4 天
- Phase 7: 2-3 天
- Phase 8: 持续进行

**总计**: 约 18-26 天（3-5 周）

## 风险和缓解措施

### 风险 1: 数据迁移失败
**缓解**: 
- 在测试环境充分测试迁移脚本
- 准备回滚脚本
- 在低峰时段执行迁移
- 提前备份数据库

### 风险 2: 库存并发更新冲突
**缓解**:
- 使用数据库事务和行锁
- 实施重试机制
- 添加详细日志记录
- 设置监控告警

### 风险 3: 用户适应新功能困难
**缓解**:
- 提供详细的用户文档
- 组织培训会议
- 提供操作演示视频
- 设置专门的支持渠道

### 风险 4: 性能下降
**缓解**:
- 进行性能测试
- 优化数据库查询
- 添加适当的索引
- 实施缓存策略

### 风险 5: 业务逻辑复杂度增加
**缓解**:
- 保持代码模块化
- 编写清晰的文档
- 进行代码审查
- 编写充分的测试
