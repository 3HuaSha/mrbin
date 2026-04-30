# 部署指南 - 手动步骤系统

## 已完成的工作

✅ 数据库迁移文件已创建并运行
✅ 前端代码已更新（排班页面 + 司机端）
✅ 类型定义已更新
✅ 代码已推送到 GitHub

## Cloudflare Pages 部署

### 自动部署
Cloudflare Pages 会自动检测到 GitHub 的新提交并触发部署。

**查看部署状态：**
1. 登录 Cloudflare Dashboard
2. 进入 Pages 项目
3. 查看 "Deployments" 标签
4. 等待构建完成（通常 2-5 分钟）

### 手动触发部署（如果需要）
如果自动部署没有触发：
1. 进入 Cloudflare Pages 项目
2. 点击 "Create deployment"
3. 选择 `main` 分支
4. 点击 "Save and Deploy"

## Supabase 数据库迁移

### 方法 1: 使用 Supabase Dashboard（推荐）

1. **登录 Supabase Dashboard**
   - 访问 https://supabase.com/dashboard
   - 选择你的项目

2. **运行迁移 SQL**
   - 进入 SQL Editor
   - 点击 "New query"
   - 复制 `supabase/migrations/20260430000000_add_manual_steps_system.sql` 的内容
   - 粘贴到编辑器
   - 点击 "Run" 执行

3. **验证迁移**
   运行以下查询验证表结构：
   ```sql
   -- 检查 common_locations 表
   SELECT * FROM common_locations;
   
   -- 检查 job_steps 表结构
   SELECT column_name, data_type, is_nullable 
   FROM information_schema.columns 
   WHERE table_name = 'job_steps'
   ORDER BY ordinal_position;
   ```

### 方法 2: 使用 Supabase CLI（如果已安装）

```bash
# 连接到远程数据库
supabase link --project-ref your-project-ref

# 推送迁移
supabase db push
```

## 验证部署

### 1. 检查数据库
```sql
-- 验证 common_locations 表存在且有数据
SELECT * FROM common_locations;
-- 应该看到 Kennedy Depot 和 Sheppard Yard

-- 验证 job_steps 表有新字段
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'job_steps'
  AND column_name IN ('driver_id', 'scheduled_date', 'order_id', 'node_type', 'notes', 'bin_id')
ORDER BY column_name;
```

### 2. 测试前端功能

**排班页面测试：**
1. 访问 `/dispatch` 页面
2. 选择一个司机
3. 查找节点之间的 "+ 插入步骤" 按钮
4. 点击按钮，应该展开插入面板
5. 测试插入步骤功能：
   - 选择地点（Kennedy Depot 或 Sheppard Yard）
   - 选择动作（取桶、放桶等）
   - 填写备注（可选）
   - 点击"确认插入"
6. 验证步骤已插入到列表中

**司机端测试：**
1. 访问 `/driver` 页面（需要司机账号登录）
2. 查看今天的任务列表
3. 验证显示：
   - 订单节点（蓝色边框）
   - 手动步骤节点（灰色边框）
4. 验证步骤锁定：
   - 第一个步骤应该可以开始
   - 后续步骤应该显示 🔒 锁定状态
5. 完成第一个步骤后，验证第二个步骤解锁

## 常见问题排查

### 问题 1: 迁移失败 - 列已存在
**错误信息：** `column "driver_id" of relation "job_steps" already exists`

**解决方案：**
迁移可能已经运行过了。检查表结构：
```sql
\d job_steps
```
如果字段已存在，说明迁移已完成。

### 问题 2: 插入步骤按钮不显示
**可能原因：**
- 前端代码未更新
- 浏览器缓存

**解决方案：**
1. 清除浏览器缓存（Ctrl+Shift+R 强制刷新）
2. 检查 Cloudflare Pages 部署状态
3. 查看浏览器控制台是否有错误

### 问题 3: 司机端查询失败
**错误信息：** `column "driver_id" does not exist`

**解决方案：**
数据库迁移未完成，重新运行迁移 SQL。

### 问题 4: 常用地点列表为空
**解决方案：**
手动插入常用地点：
```sql
INSERT INTO public.common_locations (name, address, type) VALUES
  ('Kennedy Depot', '3445 Kennedy Rd, Toronto, ON', 'depot'),
  ('Sheppard Yard', '12441 Sheppard Ave, Toronto, ON', 'depot')
ON CONFLICT DO NOTHING;
```

## 回滚方案（如果需要）

如果新功能有问题，可以回滚到上一个版本：

### 1. 回滚代码
```bash
git revert HEAD
git push
```

### 2. 回滚数据库（谨慎操作）
```sql
-- 删除新增的表
DROP TABLE IF EXISTS public.common_locations;

-- 恢复 job_steps 表（需要备份）
-- 注意：这会删除所有手动步骤数据
DELETE FROM job_steps WHERE node_type = 'step';

-- 移除新增的列（可选，不推荐）
ALTER TABLE job_steps DROP COLUMN IF EXISTS driver_id;
ALTER TABLE job_steps DROP COLUMN IF EXISTS scheduled_date;
ALTER TABLE job_steps DROP COLUMN IF EXISTS order_id;
ALTER TABLE job_steps DROP COLUMN IF EXISTS node_type;
ALTER TABLE job_steps DROP COLUMN IF EXISTS notes;
ALTER TABLE job_steps DROP COLUMN IF EXISTS bin_id;
```

## 监控和日志

### Cloudflare Pages 日志
1. 进入 Cloudflare Dashboard
2. 选择 Pages 项目
3. 查看 "Functions" 标签的日志

### Supabase 日志
1. 进入 Supabase Dashboard
2. 选择 "Logs" 标签
3. 查看 API 和 Database 日志

## 下一步

部署完成后，建议：

1. **测试所有功能**
   - 插入步骤
   - 删除步骤
   - 司机端查看步骤
   - 步骤锁定逻辑

2. **收集用户反馈**
   - 调度员使用体验
   - 司机端使用体验
   - 功能改进建议

3. **计划后续功能**
   - 拖拽排序
   - 步骤编辑
   - 步骤模板
   - 批量操作

## 联系支持

如果遇到问题：
1. 检查浏览器控制台错误
2. 检查 Cloudflare Pages 部署日志
3. 检查 Supabase 数据库日志
4. 查看 `MANUAL_STEPS_IMPLEMENTATION.md` 了解实现细节
