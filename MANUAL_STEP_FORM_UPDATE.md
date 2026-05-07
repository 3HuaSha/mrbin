# 📝 手动步骤表单更新

## 修改内容

更新了排班看板页面的手动步骤添加表单，简化了流程并固定了选项。

### 修改文件
- `src/pages/DispatchPage.tsx` - `InsertStepButton` 组件

## 新的表单结构

### 1️⃣ 第一行：选择动作（3种）
- **放下桶** (drop_bin)
- **取走桶** (pickup_bin)
- **倒垃圾** (dump_waste)

### 2️⃣ 第二行：选择地点（根据动作动态显示）

**如果选择"放下桶"或"取走桶"：**
- 3445
- 12441

**如果选择"倒垃圾"：**
- york1 300
- 63A
- draglam
- maple waste
- 3445
- york1 whitby
- york1 brampton

### 3️⃣ 第三行：桶大小（4种）
- 14 yd
- 20 yd
- 30 yd
- 40 yd

### 4️⃣ 第四行：备注（可选）
- 自由文本输入
- 桶大小会自动添加到备注前面（例如："20yd - 客户要求"）

## 主要改进

### ✅ 简化流程
- 移除了自定义地址功能
- 移除了桶号选择（不再需要）
- 移除了"装料"和"卸料"动作（只保留3种核心动作）

### ✅ 动态地点选项
- 地点选项根据选择的动作自动变化
- 切换动作时会自动重置地点选择

### ✅ 自动记录桶大小
- 桶大小会自动添加到备注中
- 格式：`{桶大小}yd - {用户备注}`
- 如果没有备注，只显示：`{桶大小}yd`

## 使用流程

1. 点击司机行中的 **+** 按钮
2. 选择**动作**（放下桶/取走桶/倒垃圾）
3. 根据动作选择对应的**地点**
4. 选择**桶大小**（14/20/30/40 yd）
5. （可选）输入**备注**
6. 点击**确认**插入步骤

## 示例

### 示例 1：放下桶
```
动作：放下桶
地点：3445
桶大小：20 yd
备注：客户要求
→ 最终备注：20yd - 客户要求
```

### 示例 2：倒垃圾
```
动作：倒垃圾
地点：york1 300
桶大小：40 yd
备注：（空）
→ 最终备注：40yd
```

### 示例 3：取走桶
```
动作：取走桶
地点：12441
桶大小：14 yd
备注：需要清洗
→ 最终备注：14yd - 需要清洗
```

## 技术细节

### 状态管理
```typescript
const [stepType, setStepType] = useState("");      // 动作类型
const [location, setLocation] = useState("");      // 地点
const [binSize, setBinSize] = useState("");        // 桶大小
const [notes, setNotes] = useState("");            // 备注
```

### 地点选项逻辑
```typescript
const getLocationOptions = () => {
  if (stepType === "pickup_bin" || stepType === "drop_bin") {
    return [
      { value: "3445", label: "3445" },
      { value: "12441", label: "12441" }
    ];
  } else if (stepType === "dump_waste") {
    return [
      { value: "york1 300", label: "york1 300" },
      { value: "63A", label: "63A" },
      { value: "draglam", label: "draglam" },
      { value: "maple waste", label: "maple waste" },
      { value: "3445", label: "3445" },
      { value: "york1 whitby", label: "york1 whitby" },
      { value: "york1 brampton", label: "york1 brampton" }
    ];
  }
  return [];
};
```

### 表单验证
- 必须选择动作
- 必须选择地点
- 必须选择桶大小
- 备注可选

## 部署

修改已完成，准备部署：

```bash
git add src/pages/DispatchPage.tsx
git commit -m "feat: 简化手动步骤表单，固定动作和地点选项"
git push
```

Railway 会自动部署更新。

## 相关文件
- `src/pages/DispatchPage.tsx` - 排班看板页面（已修改）
- `MANUAL_STEPS_IMPLEMENTATION.md` - 手动步骤功能文档
