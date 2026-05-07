# 🔧 修复司机车辆重复分配问题

## 问题描述
在车队管理页面给司机更换车辆时，刷新后司机会显示有两台车。

## 根本原因
前端代码在分配新车辆时，只是**插入**了新的分配记录，但**没有删除**旧的分配记录。

数据库表虽然有 `UNIQUE(driver_id, vehicle_id)` 约束，但这只防止同一个司机被分配同一辆车两次，并不防止一个司机被分配多辆不同的车。

## 修复内容

### 1. 前端代码修复 ✅
**文件**: `src/pages/FleetPage.tsx`

**修改前**:
```typescript
const assignVehicle = useMutation({
  mutationFn: async () => {
    // 直接插入新分配
    const { error } = await supabase.from("driver_vehicle_assignments").insert({
      driver_id: driver.id,
      vehicle_id: selectedVehicleId,
    });
  },
});
```

**修改后**:
```typescript
const assignVehicle = useMutation({
  mutationFn: async () => {
    // 先删除该司机的所有旧分配
    const { error: deleteError } = await supabase
      .from("driver_vehicle_assignments")
      .delete()
      .eq("driver_id", driver.id);
    
    if (deleteError) throw deleteError;

    // 再插入新的分配
    const { error } = await supabase.from("driver_vehicle_assignments").insert({
      driver_id: driver.id,
      vehicle_id: selectedVehicleId,
    });
  },
});
```

### 2. 清理现有重复数据 📋
**文件**: `CLEANUP_DUPLICATE_ASSIGNMENTS.sql`

在 Supabase SQL Editor 中运行此脚本来清理现有的重复分配：

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目
3. 进入 **SQL Editor**
4. 复制 `CLEANUP_DUPLICATE_ASSIGNMENTS.sql` 的内容
5. 粘贴并点击 **Run**

脚本会：
- 显示哪些司机有多个车辆分配
- 删除旧的分配，只保留最新的一个
- 验证清理结果

## 测试步骤

1. **清理现有数据**：在 Supabase 运行清理脚本
2. **部署修复**：
   ```bash
   git add src/pages/FleetPage.tsx
   git commit -m "fix: 修复司机车辆重复分配问题"
   git push
   ```
3. **验证修复**：
   - 在车队页面给司机分配一辆车
   - 再给同一个司机分配另一辆车
   - 刷新页面
   - 确认司机只显示最新分配的车辆

## 技术细节

### 为什么不修改数据库约束？
我们可以在数据库层面添加约束确保一个司机只能有一个车辆分配，但这样做会降低灵活性。如果将来需要支持一个司机多辆车的场景，只需修改前端逻辑即可。

### 为什么使用 DELETE + INSERT 而不是 UPSERT？
因为我们需要删除**所有**旧分配，而不是更新特定的一条记录。使用 DELETE + INSERT 更清晰明确。

## 相关文件
- `src/pages/FleetPage.tsx` - 车队管理页面（已修复）
- `CLEANUP_DUPLICATE_ASSIGNMENTS.sql` - 清理脚本
- `supabase/migrations/20260428000000_add_driver_vehicle_assignments.sql` - 原始表结构

## 部署状态
- ✅ 代码已修复
- ⏳ 需要在 Supabase 运行清理脚本
- ⏳ 需要部署到 Railway
