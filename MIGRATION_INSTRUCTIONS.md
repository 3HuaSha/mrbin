# 数据库迁移说明

## 新增功能：司机车辆分配

### ⚠️ 遇到权限问题？

如果遇到 `permission denied for table driver_vehicle_assignments` 错误，请使用下面的**快速修复方法**。

### 🔧 快速修复方法（推荐）

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **SQL Editor**
4. 复制 `FIX_PERMISSIONS.sql` 文件的**完整内容**
5. 粘贴到 SQL Editor 并点击 **Run**
6. 查看结果，应该能看到 `open_all` 策略已创建

### 标准迁移方法

#### 方法 1：使用 Supabase CLI

```bash
# 1. 确保已安装 Supabase CLI
# 如果没有安装，运行：npm install -g supabase

# 2. 链接到你的云端项目
supabase link --project-ref your-project-ref

# 3. 推送迁移到云端
supabase db push
```

#### 方法 2：在 Supabase Dashboard 手动执行

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **SQL Editor**
4. 复制 `supabase/migrations/20260428000000_add_driver_vehicle_assignments.sql` 的内容
5. 粘贴到 SQL Editor 并点击 **Run**

### 迁移内容

这个迁移会创建：
- `driver_vehicle_assignments` 表：存储司机和车辆的分配关系
- 相关索引：优化查询性能
- RLS 策略：权限控制

### 新增功能说明

1. **司机卡片显示已分配车辆**
   - 每个司机下方会显示已分配的车辆列表
   - 如果没有分配车辆，显示"未分配车辆"

2. **分配车辆对话框**
   - 点击"分配车辆"按钮打开对话框
   - 第一步：选择车辆类型（BIN、FLAT、DUMP 等）
   - 第二步：从该类型中选择具体车辆
   - 显示已分配的车辆，可以取消分配

3. **智能筛选**
   - 按车辆类型分组显示
   - 已分配的车辆会标记为"已分配"
   - 防止重复分配

### 测试步骤

1. 应用数据库迁移
2. 刷新车队页面
3. 点击任意司机的"分配车辆"按钮
4. 选择车辆类型，然后选择具体车辆
5. 确认分配后，司机卡片下方会显示已分配的车辆
6. 可以点击垃圾桶图标取消分配
