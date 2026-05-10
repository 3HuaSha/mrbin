# 司机同步问题修复总结

## 问题描述

1. **名字没有规范化**：同步后司机名字仍然是 `Jason(2)` 这种格式
2. **多出来的人**：同步后出现了不应该存在的旧司机账户

## 根本原因

之前的同步逻辑：
- ❌ 没有删除旧的司机账户
- ❌ 没有清理带括号后缀的重复账户
- ❌ 每次同步可能创建新账户，导致越来越多

## 解决方案

### 修改的文件

**`src/pages/FleetPage.tsx`** - 更新了同步逻辑：

1. **名称规范化**
   ```typescript
   const normalizeDriverName = (name: string): string => {
     return name.replace(/\s*\(\d+\)\s*$/g, '').trim();
   };
   ```
   - `Jason(2)` → `Jason`
   - `Dao(1)` → `Dao`

2. **智能合并**
   - 如果数据库中已有 `Jason`，重用该账户
   - 如果没有，创建新的 `Jason` 账户
   - 所有 `Jason(1)`、`Jason(2)` 的数据都关联到 `Jason`

3. **自动清理**
   - 同步完成后，自动删除不在 Samsara 中的旧重复账户
   - 只删除带括号后缀的账户（如 `Jason(2)`）
   - 保留规范化后的主账户（如 `Jason`）

4. **停用管理**
   - 先将所有司机标记为停用
   - 重新激活在 Samsara 中的司机
   - 不在 Samsara 中的司机保持停用状态

### 新增的文件

1. **`QUICK_CLEANUP_DUPLICATES.sql`** - 快速清理脚本
   - 立即删除所有带括号后缀的司机账户
   - 清理相关的外键引用

2. **`CLEANUP_DUPLICATE_DRIVERS.sql`** - 完整合并脚本
   - 合并重复账户的所有数据
   - 转移历史记录到主账户

3. **`DRIVER_DEDUPLICATION_GUIDE.md`** - 详细使用说明

## 使用步骤

### 第一步：清理现有重复账户

在 Supabase SQL Editor 中运行：

```sql
-- 来自 QUICK_CLEANUP_DUPLICATES.sql
DO $$
DECLARE
  duplicate_record RECORD;
BEGIN
  FOR duplicate_record IN 
    SELECT id, name
    FROM profiles
    WHERE role = 'driver'
      AND name ~ '\(\d+\)$'
  LOOP
    RAISE NOTICE '🗑️ 删除重复账户: %', duplicate_record.name;
    DELETE FROM driver_vehicle_assignments WHERE driver_id = duplicate_record.id;
    DELETE FROM driver_locations WHERE driver_id = duplicate_record.id;
    DELETE FROM profiles WHERE id = duplicate_record.id;
  END LOOP;
END $$;
```

### 第二步：刷新浏览器

- 按 `Ctrl + Shift + R` 强制刷新页面
- 确保加载最新的代码

### 第三步：重新同步

1. 在车队页面点击"从 Samsara 同步"按钮
2. 查看控制台日志，确认规范化过程：
   ```
   🔍 处理司机: "Jason(2)" -> 规范化为 "Jason"
   ✅ 找到现有账户: Jason (ID: xxx)
   ```

### 第四步：验证结果

检查司机列表：
- ✅ 所有名字都是规范化的（没有括号）
- ✅ 没有重复账户
- ✅ 车辆分配正确

## 预期效果

### 同步前
```
司机列表：
- Jason(2)
- Dao(1)
- Dao(2)
- John
- 一些不应该存在的旧司机
```

### 同步后
```
司机列表：
- Jason
- Dao
- John
（只有在 Samsara 中的司机，且名字都是规范化的）
```

## 技术细节

### 同步流程

1. **获取 Samsara 数据**
   ```typescript
   const { drivers: sDrivers } = await fetchSamsaraData();
   ```

2. **停用所有现有司机**
   ```typescript
   await supabase.from("profiles")
     .update({ is_active: false })
     .eq("role", "driver");
   ```

3. **处理每个 Samsara 司机**
   ```typescript
   for (const sd of sDrivers) {
     const normalizedName = normalizeDriverName(sd.name);
     // 查找或创建规范化后的账户
     // 激活该账户
   }
   ```

4. **清理旧的重复账户**
   ```typescript
   // 删除不在 Samsara 中且带括号后缀的账户
   if (!samsaraDriverNames.has(normalizedName) && 
       driver.name.match(/\(\d+\)$/)) {
     // 删除该账户
   }
   ```

### 外键处理

删除司机账户前，会先删除：
- `driver_vehicle_assignments` - 车辆分配
- `driver_locations` - 位置记录

保留（不删除）：
- `job_steps` - 作业步骤（历史数据）
- `dispatch_assignments` - 调度分配（历史数据）

## 常见问题

### Q: 为什么同步后还是看到 Jason(2)？

A: 可能是浏览器缓存问题，请：
1. 强制刷新页面（Ctrl + Shift + R）
2. 清除浏览器缓存
3. 检查是否部署了最新代码

### Q: 同步后司机数量变少了？

A: 这是正常的，因为：
1. 重复账户被合并了（Jason(1) + Jason(2) → Jason）
2. 不在 Samsara 中的旧账户被删除了

### Q: 历史数据会丢失吗？

A: 不会，历史的作业步骤和调度记录都会保留。

### Q: 如果我想保留某个带括号的账户怎么办？

A: 在数据库中手动将其重命名为不带括号的名称，例如：
- `Jason(2)` → `Jason Smith`
- `Dao(1)` → `Dao Wang`

## 更新日志

- **2024-05-10**: 修复同步逻辑，添加自动清理功能
- **2024-05-09**: 初始版本，添加名称规范化

## 相关文件

- `src/pages/FleetPage.tsx` - 主要修改文件
- `QUICK_CLEANUP_DUPLICATES.sql` - 快速清理脚本
- `CLEANUP_DUPLICATE_DRIVERS.sql` - 完整合并脚本
- `DRIVER_DEDUPLICATION_GUIDE.md` - 详细使用说明
