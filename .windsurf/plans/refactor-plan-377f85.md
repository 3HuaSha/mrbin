# 项目重构与代码清理计划

本项目将通过提取公共逻辑、简化状态管理以及拆分大型组件，使代码结构更清晰、更易于维护，同时解决本地状态同步不稳定的问题。

## 1. 核心改进方向

### A. 类型中心化 (Type Centralization)
目前 `Order`, `Profile`, `Vehicle`, `JobStep` 等类型在 `DispatchPage.tsx`, `FleetMapPage.tsx` 和 `OrdersPage.tsx` 中重复定义。我们将它们统一抽取到 `@/types/dispatch.ts`，并优先使用 Supabase 自动生成的类型。

### B. 数据层与状态管理 (Data & State Management)
- **保留“保存”按钮模式**：尊重用户习惯，维持“先排班，后统一保存”的流程，避免司机端看到中间改动。
- **优化草稿系统**：目前 `DispatchPage` 使用 `localAssignments` 和 `localJobSteps` 进行草稿管理，逻辑较为分散。我们将创建一个统一的 `useDispatchDraft` Hook，专门管理未保存的变更（包括顺序调整、跨司机分配、手动步骤插入），并提供清晰的“撤销”和“保存”接口。
- **解决同步跳变**：通过合并“原始数据”与“草稿变更”来计算“最终显示视图”，避免由于 Supabase 刷新导致的 UI 闪烁或位置跳变。

### C. 组件拆分 (Component Extraction)
- **DispatchPage (排班页)**: 目前超过 2300 行。将拆分为 `BacklogColumn`, `DriverColumn`, `OrderCard`, `ManualStepCard` 等独立组件。
- **FleetMapPage (地图页)**: 提取侧边栏任务列表、地图控制逻辑等。

### D. 业务逻辑抽取
将“生成任务步骤”、“计算 ETA”等核心逻辑从 UI 组件中移出，放入专门的服务类或工具函数中。

---

## 2. 实施步骤

### 第一步：基础建设 (Read-only / Safe)
- [ ] 创建 `@/types/dispatch.ts` 存放共享类型。
- [ ] 创建 `@/hooks/use-dispatch-data.ts` 封装核心数据流和实时更新逻辑。

### 第二步：重构 DispatchPage
- [ ] 将页面内的子组件 (如 `DriverColumn`, `BacklogColumn`) 提取到 `@/components/dispatch/` 目录下。
- [ ] 简化拖拽回调逻辑，将其部分逻辑移至外部 Helper 函数。

### 第三步：重构 FleetMapPage
- [ ] 复用 `useDispatchData` 钩子，移除页面内重复的 Fetch 逻辑。
- [ ] 优化 `draft` (草稿) 系统的实现，使其更可靠。

### 第四步：清理无效代码
- [ ] 清理 `scratch/` 和 `scripts/` 目录下不再使用的脚本文件。
- [ ] 移除页面中定义了但未使用的变量和导入。

---

## 3. 待确认事项 (Questions for User)
1. **关于脚本文件**：`scratch/` 和 `scripts/` 下有很多 `.py` 和 `.js` 文件，是否可以全部移动到一个 `archive/` 备份文件夹中，以保持根目录整洁？
2. **关于排班逻辑**：目前 `DispatchPage` 在创建排班时会自动在前端生成几个 `job_steps`。你是否希望将这部分逻辑移到后端 (Supabase Trigger) 以保证一致性，还是维持现在的“前端生成，用户点击保存”模式？
3. **关于状态管理**：目前本地状态不同步的具体表现是什么？（例如：保存后 UI 不更新，或者拖拽后位置跳变？）

---
