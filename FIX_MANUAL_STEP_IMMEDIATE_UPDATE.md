# 修复手动步骤立即显示问题

## 问题描述

**之前的问题：**
- 在排班页面点击"插入步骤"后，新步骤不会立即显示
- 需要点击"同步修改"按钮才能看到新插入的步骤
- 删除步骤时也有类似问题

**原因：**
- `insertManualStep` 和 `deleteManualStep` mutations 只刷新了查询缓存（`invalidateQueries`）
- 没有立即更新本地状态（`localJobSteps`）
- 导致界面不会立即反映变化

## 解决方案

### 1. 修复插入步骤

**修改前：**
```typescript
onSuccess: () => {
  toast.success("已插入步骤");
  setInsertStepAt(null);
  qc.invalidateQueries({ queryKey: ["job-steps", date] });
}
```

**修改后：**
```typescript
onSuccess: (result) => {
  const { newStep, stepsToUpdate } = result;
  
  // 立即更新本地状态
  const updatedSteps = [...currentJobSteps];
  
  // 添加新步骤
  updatedSteps.push(newStep);
  
  // 更新后续步骤的编号
  stepsToUpdate.forEach(oldStep => {
    const index = updatedSteps.findIndex(s => s.id === oldStep.id);
    if (index >= 0) {
      updatedSteps[index] = { ...updatedSteps[index], step_number: oldStep.step_number + 1 };
    }
  });
  
  setLocalJobSteps(updatedSteps);
  
  toast.success("已插入步骤");
  setInsertStepAt(null);
  qc.invalidateQueries({ queryKey: ["job-steps", date] });
}
```

### 2. 修复删除步骤

**修改前：**
```typescript
onSuccess: () => {
  toast.success("已删除步骤");
  qc.invalidateQueries({ queryKey: ["job-steps", date] });
}
```

**修改后：**
```typescript
onSuccess: (result) => {
  const { deletedStep, laterSteps } = result;
  
  // 立即更新本地状态
  let updatedSteps = currentJobSteps.filter(s => s.id !== deletedStep.id);
  
  // 更新后续步骤的编号
  updatedSteps = updatedSteps.map(s => {
    if (laterSteps.some(ls => ls.id === s.id)) {
      return { ...s, step_number: s.step_number - 1 };
    }
    return s;
  });
  
  setLocalJobSteps(updatedSteps);
  
  toast.success("已删除步骤");
  qc.invalidateQueries({ queryKey: ["job-steps", date] });
}
```

## 技术细节

### 本地状态管理

系统使用了双重状态管理：
1. **服务器状态**：通过 React Query 管理（`jobSteps`）
2. **本地状态**：用于临时修改（`localJobSteps`）

```typescript
const currentJobSteps = localJobSteps ?? jobSteps;
```

### 更新流程

**插入步骤：**
1. 向数据库插入新步骤
2. 更新数据库中后续步骤的编号
3. **立即更新 `localJobSteps`**：
   - 添加新步骤到数组
   - 更新后续步骤的 `step_number`
4. 刷新查询缓存（后台同步）

**删除步骤：**
1. 从数据库删除步骤
2. 更新数据库中后续步骤的编号
3. **立即更新 `localJobSteps`**：
   - 从数组中移除删除的步骤
   - 更新后续步骤的 `step_number`
4. 刷新查询缓存（后台同步）

## 用户体验改进

### 修复前
1. 点击"插入步骤" → 填写表单 → 提交
2. ❌ 界面没有变化
3. 点击"同步修改"
4. ✅ 步骤出现

### 修复后
1. 点击"插入步骤" → 填写表单 → 提交
2. ✅ **步骤立即出现**
3. 无需点击"同步修改"

## 测试建议

### 插入步骤测试
1. 在司机行中点击 + 按钮
2. 填写步骤信息并提交
3. **验证**：步骤立即显示在正确位置
4. **验证**：后续步骤的编号自动更新
5. **验证**：不需要点击"同步修改"

### 删除步骤测试
1. 将手动步骤拖到待排班区域
2. **验证**：步骤立即消失
3. **验证**：后续步骤的编号自动更新
4. **验证**：不需要点击"同步修改"

### 混合操作测试
1. 插入多个步骤
2. 删除中间的步骤
3. 再插入新步骤
4. **验证**：所有操作都立即反映在界面上
5. **验证**：步骤编号始终连续

### 并发测试
1. 快速连续插入多个步骤
2. **验证**：所有步骤都正确显示
3. **验证**：编号正确且连续

## 相关文件

- `src/pages/DispatchPage.tsx` - 主要修改文件
  - `insertManualStep` mutation：添加立即更新本地状态
  - `deleteManualStep` mutation：添加立即更新本地状态

## 注意事项

1. **数据一致性**：
   - 本地状态更新是乐观更新（optimistic update）
   - 如果数据库操作失败，需要回滚本地状态
   - 当前实现依赖 `invalidateQueries` 来同步最终状态

2. **"同步修改"按钮**：
   - 仍然需要用于同步订单分配的修改
   - 手动步骤的插入和删除现在是立即生效的
   - 但如果拖动步骤重新排序，仍需点击"同步修改"

3. **性能考虑**：
   - 立即更新本地状态避免了等待网络请求
   - 提供了更流畅的用户体验
   - 后台仍然会刷新查询缓存以确保数据一致性

## 未来改进建议

1. **错误处理**：
   - 如果数据库操作失败，回滚本地状态
   - 显示更详细的错误信息

2. **乐观更新**：
   - 在请求发送前就更新界面
   - 进一步提升响应速度

3. **批量操作**：
   - 支持批量插入/删除步骤
   - 减少数据库请求次数

4. **撤销功能**：
   - 添加撤销/重做功能
   - 允许用户撤销误操作
