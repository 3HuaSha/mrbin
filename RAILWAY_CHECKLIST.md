# Railway 部署检查清单 ✅

## 当前状态
- ✅ 旧的 `server.js` 已重命名为 `server.js.old`
- ✅ `railway.json` 配置存在
- ✅ `package.json` 脚本配置正确
- ✅ 使用 TanStack Start + Supabase 架构

## 部署步骤

### 1️⃣ 本地测试（推荐先做）

```bash
# 清理旧的构建文件
rm -rf .output node_modules

# 重新安装依赖
npm install

# 构建项目
npm run build

# 测试生产服务器
npm run start
```

访问 http://localhost:3000 确认应用正常运行。

### 2️⃣ Railway 环境变量设置

在 Railway Dashboard → 你的项目 → Variables 中添加：

#### 必需的环境变量：
```
SUPABASE_URL=https://gkirxxwlkimmpukvwvgb.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_GWbZv_i_0zbtUuIt8VNi5g_V4ZW-8UJ
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdraXJ4eHdsa2ltbXB1a3Z3dmdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzE1NTc1MCwiZXhwIjoyMDkyNzMxNzUwfQ.pZ_1T6T3KKFmUXsgM2qnJ3x3EFjFgruUItqckZQLg7o

VITE_SUPABASE_URL=https://gkirxxwlkimmpukvwvgb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_GWbZv_i_0zbtUuIt8VNi5g_V4ZW-8UJ
VITE_SUPABASE_PROJECT_ID=gkirxxwlkimmpukvwvgb
VITE_GOOGLE_MAPS_API_KEY=AIzaSyAdYdNXwhNwmaTI64PzmvYDwxQm82W-b8s
VITE_SAMSARA_TOKEN=samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke

NODE_ENV=production
PORT=3000
```

⚠️ **重要**：`VITE_` 前缀的变量必须在构建时可用，确保它们在 Railway 的环境变量中设置。

### 3️⃣ 优化 railway.json（可选但推荐）

当前的 `railway.json` 已经可以工作，但你可以添加更多配置：

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npm run start",
    "restartPolicyType": "ON_FAILURE",
    "healthcheckPath": "/",
    "healthcheckTimeout": 100,
    "restartPolicyMaxRetries": 10
  }
}
```

### 4️⃣ 推送到 Railway

```bash
# 添加所有更改
git add .

# 提交
git commit -m "Fix Railway deployment - remove old server.js, use TanStack Start"

# 推送到 Railway
git push
```

Railway 会自动检测到更改并开始部署。

### 5️⃣ 监控部署

在 Railway Dashboard 中：
1. 查看 **Build Logs** - 确认构建成功
2. 查看 **Deploy Logs** - 确认服务器启动
3. 点击生成的 URL 测试应用

## 常见错误及解决方案

### ❌ 错误 1：`Cannot find module '.output/server/index.mjs'`

**原因**：构建失败或未完成

**解决方案**：
```bash
# 检查 Railway 构建日志
# 确保 npm run build 成功完成
# 查看是否有依赖安装错误
```

### ❌ 错误 2：`VITE_SUPABASE_URL is not defined`

**原因**：环境变量未在构建时可用

**解决方案**：
1. 在 Railway Variables 中添加所有 `VITE_` 前缀的变量
2. 重新部署（Railway → Deployments → Redeploy）

### ❌ 错误 3：应用启动但返回 404

**原因**：路由配置问题或静态文件未正确构建

**解决方案**：
```bash
# 本地测试构建
npm run build
npm run start

# 检查 .output 目录是否包含所有文件
ls -la .output/server
ls -la .output/public
```

### ❌ 错误 4：Supabase 连接失败

**原因**：环境变量错误或 Supabase 项目配置问题

**解决方案**：
1. 验证 Supabase URL 和 Key 是否正确
2. 检查 Supabase Dashboard → Settings → API
3. 确认 Supabase 项目没有暂停

### ❌ 错误 5：构建超时

**原因**：依赖安装时间过长

**解决方案**：
```bash
# 在 railway.json 中增加超时时间
# 或者优化 package.json 依赖
```

## 验证部署成功

✅ 部署成功的标志：
1. Railway 显示 "Deployed" 状态（绿色）
2. 可以访问 Railway 提供的 URL
3. 看到登录页面
4. 可以使用 Supabase 认证登录
5. 所有页面（调度、车队、订单等）正常加载

## 性能优化建议

部署成功后，考虑以下优化：

1. **启用 CDN**：Railway 自动提供 CDN
2. **配置自定义域名**：在 Railway Settings 中添加
3. **设置健康检查**：已在 railway.json 中配置
4. **监控日志**：定期检查 Railway 日志
5. **数据库优化**：确保 Supabase 索引正确

## 回滚计划

如果部署失败，可以：
1. 在 Railway Dashboard → Deployments 中回滚到之前的版本
2. 或者恢复 `server.js.old` 并使用旧的部署方式（不推荐）

## 需要帮助？

如果遇到问题：
1. 检查 Railway 构建和部署日志
2. 查看浏览器控制台错误
3. 验证所有环境变量是否正确设置
4. 确认 Supabase 项目正常运行

## 下一步

部署成功后：
1. ✅ 运行数据库迁移（参考 MIGRATION_INSTRUCTIONS.md）
2. ✅ 测试所有功能
3. ✅ 配置自定义域名（可选）
4. ✅ 设置监控和告警
