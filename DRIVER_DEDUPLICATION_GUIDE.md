# 司机账户去重功能说明

## 问题描述

从 Samsara 同步司机数据时，可能会出现重复账户，例如：
- Dao(1)
- Dao(2)
- John(1)
- John(2)

这些重复账户会导致：
1. 登录时需要记住具体是哪个账户（Dao(1) 还是 Dao(2)）
2. 车辆分配时需要选择正确的账户
3. 数据管理混乱

## 解决方案

### 1. 自动去重同步（已实现 - 最新版本）

修改了 `FleetPage.tsx` 中的 Samsara 同步逻辑，添加了完整的去重和清理功能：

**工作原理：**
- 当从 Samsara 同步司机时，系统会自动移除名称中的括号后缀
- `Dao(1)` → `Dao`
- `Dao(2)` → `Dao`
- `John(1)` → `John`
- `Jason(2)` → `Jason`

**同步行为（最新版本）：**
1. **规范化名称**：所有 Samsara 司机名称会被规范化（移除括号后缀）
2. **合并账户**：如果数据库中已存在规范化后的账户（如 `Dao`），会重用该账户
3. **创建新账户**：如果不存在，会创建规范化后的新账户
4. **自动清理**：同步完成后，会自动删除不在 Samsara 中的旧重复账户（带括号后缀的）
5. **停用管理**：不在 Samsara 中的司机会被标记为停用

**优势：**
- 只保留规范化后的主账户（如 `Dao`、`Jason`）
- 自动删除旧的重复账户（如 `Jason(2)`、`Dao(1)`）
- 无论 Samsara 中是 `Dao(1)` 还是 `Dao(2)` 分配车辆，都会分配给 `Dao`
- 登录时只需使用主账户
- 每次同步都会清理不需要的账户

### 2. 立即清理现有重复账户（推荐）

如果你现在就有重复账户（如 Jason(2)），可以使用 `QUICK_CLEANUP_DUPLICATES.sql` 快速清理：

**使用方法：**
1. 在 Supabase SQL Editor 中打开 `QUICK_CLEANUP_DUPLICATES.sql`
2. 先运行步骤 1 查看将要删除的账户
3. 确认无误后，运行步骤 2 执行清理
4. 运行步骤 3 和 4 验证结果

**这个脚本会：**
- 自动删除所有带括号后缀的司机账户（如 Jason(2), Dao(1)）
- 删除相关的车辆分配和位置记录
- 保留历史的作业步骤和调度记录

**注意：** 清理后，请在车队页面重新点击"从 Samsara 同步"，系统会创建规范化后的账户。

### 3. 完整合并清理（高级用户）

如果你已经有重复账户，可以使用 `CLEANUP_DUPLICATE_DRIVERS.sql` 脚本清理：

#### 方法 A: 手动清理（推荐，更安全）

1. 在 Supabase SQL Editor 中运行步骤 1 查看所有重复账户：
```sql
SELECT 
  id,
  name,
  phone,
  email,
  is_active,
  REGEXP_REPLACE(name, '\s*\(\d+\)\s*$', '', 'g') as normalized_name
FROM profiles
WHERE role = 'driver'
  AND name ~ '\(\d+\)$'
ORDER BY normalized_name, name;
```

2. 对于每个重复账户，手动执行合并：
```sql
-- 示例：合并 Dao(1) 到 Dao
-- 先找到主账户 ID
SELECT id, name FROM profiles WHERE name = 'Dao' AND role = 'driver';

-- 假设主账户 ID 是 'abc-123-def'
-- 假设 Dao(1) 的 ID 是 'xyz-456-uvw'

-- 转移车辆分配
UPDATE driver_vehicle_assignments
SET driver_id = 'abc-123-def'
WHERE driver_id = 'xyz-456-uvw';

-- 转移调度分配
UPDATE dispatch_assignments
SET driver_id = 'abc-123-def'
WHERE driver_id = 'xyz-456-uvw';

-- 删除重复账户
DELETE FROM profiles WHERE id = 'xyz-456-uvw';
```

#### 方法 B: 自动批量清理（高级用户）

在 Supabase SQL Editor 中运行步骤 4 的完整脚本，它会自动：
1. 找到所有带括号后缀的账户
2. 查找或创建对应的主账户
3. 转移所有关联数据
4. 删除重复账户

**注意：** 运行前请先备份数据！

### 3. 使用流程（更新）

#### 立即清理并同步（推荐）

1. **清理现有重复账户**
   - 在 Supabase SQL Editor 中运行 `QUICK_CLEANUP_DUPLICATES.sql`
   - 这会删除所有 Jason(2)、Dao(1) 这类账户

2. **刷新浏览器页面**
   - 确保加载最新的代码

3. **从 Samsara 同步**
   - 在车队页面点击"从 Samsara 同步"按钮
   - 系统会自动创建规范化后的账户（Jason、Dao）
   - 自动删除不在 Samsara 中的旧账户

4. **验证结果**
   - 检查司机列表，确认所有名字都是规范化的（没有括号后缀）
   - 检查车辆分配是否正确

#### 日常使用

1. **定期同步**
   - 定期点击"从 Samsara 同步"按钮
   - 系统会自动处理新的重复账户

2. **手动管理**
   - 如果需要手动添加司机，直接使用规范化后的名称（如 `Dao`，而不是 `Dao(1)`）

## 技术细节

### 名称规范化函数

```typescript
const normalizeDriverName = (name: string): string => {
  if (!name) return '';
  // 移除 (1), (2) 等后缀
  return name.replace(/\s*\(\d+\)\s*$/g, '').trim();
};
```

### 匹配逻辑

同步时，系统会尝试多种方式匹配司机：
1. 通过 Samsara ID 直接匹配
2. 通过规范化后的名称匹配
3. 通过原始名称（包含括号）匹配
4. 通过清理后的名称（移除所有特殊字符）匹配

这确保了无论 Samsara 中的数据格式如何，都能正确匹配到主账户。

## 常见问题

### Q: 如果我想保留 Dao(1) 和 Dao(2) 作为两个不同的司机怎么办？

A: 在数据库中手动将他们重命名为更明确的名称，例如：
- `Dao Wang` 和 `Dao Li`
- `Dao - Morning Shift` 和 `Dao - Night Shift`

### Q: 同步后发现车辆分配错误怎么办？

A: 在车队页面手动调整车辆分配，或者在 Samsara 中修正数据后重新同步。

### Q: 如何确认清理成功？

A: 运行验证查询：
```sql
SELECT name, COUNT(*) as count
FROM profiles
WHERE role = 'driver'
GROUP BY name
HAVING COUNT(*) > 1;
```
如果返回空结果，说明没有重复账户了。

## 注意事项

1. **备份数据**：在运行清理脚本前，建议先备份数据库
2. **测试环境**：建议先在测试环境中验证
3. **Auth 账户**：如果重复账户已经关联了 Auth 用户，删除前需要先处理 Auth 关联
4. **历史数据**：清理脚本会保留所有历史数据（调度记录、订单等），只是将它们关联到主账户

## 更新日志

- 2024-05-09: 添加自动去重功能和清理脚本
