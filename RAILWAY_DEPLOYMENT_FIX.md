# Railway 部署修复指南

## 问题诊断

你的项目有两个冲突的服务器配置：
1. **`server.js`** - 旧的 Express + Google Cloud Firestore 代码（不应使用）
2. **TanStack Start** - 实际使用的框架（通过 Vite 构建）

## 解决方案

### 步骤 1：更新 railway.json

将 `railway.json` 替换为以下内容：

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

### 步骤 2：在 Railway 设置环境变量

在 Railway Dashboard 中设置以下环境变量：

```bash
# Supabase 配置
SUPABASE_URL=https://gkirxxwlkimmpukvwvgb.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_GWbZv_i_0zbtUuIt8VNi5g_V4ZW-8UJ
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdraXJ4eHdsa2ltbXB1a3Z3dmdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzE1NTc1MCwiZXhwIjoyMDkyNzMxNzUwfQ.pZ_1T6T3KKFmUXsgM2qnJ3x3EFjFgruUItqckZQLg7o

# Vite 环境变量（前端需要）
VITE_SUPABASE_URL=https://gkirxxwlkimmpukvwvgb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_GWbZv_i_0zbtUuIt8VNi5g_V4ZW-8UJ
VITE_SUPABASE_PROJECT_ID=gkirxxwlkimmpukvwvgb
VITE_GOOGLE_MAPS_API_KEY=AIzaSyAdYdNXwhNwmaTI64PzmvYDwxQm82W-b8s
VITE_SAMSARA_TOKEN=samsara_api_xuwBoWcChtpqYPlGqEhhpmXncEhIke

# Node 环境
NODE_ENV=production
PORT=3000
```

### 步骤 3：删除或重命名旧的 server.js

旧的 `server.js` 文件是 Google Cloud/Firestore 的代码，与当前的 Supabase 架构不兼容。

```bash
# 重命名为备份
mv server.js server.js.old
```

或者直接删除：
```bash
rm server.js
```

### 步骤 4：确认 package.json 脚本

确认 `package.json` 中的脚本正确：

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "node .output/server/index.mjs",
    "preview": "vite preview"
  }
}
```

### 步骤 5：本地测试构建

在部署到 Railway 之前，先在本地测试：

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 启动生产服务器
npm run start
```

如果本地构建成功，访问 http://localhost:3000 应该能看到应用。

### 步骤 6：推送到 Railway

```bash
# 提交更改
git add .
git commit -m "Fix Railway deployment configuration"
git push

# Railway 会自动检测到更改并重新部署
```

## 常见问题排查

### 问题 1：构建失败 - "Cannot find module"

**解决方案**：确保所有依赖都在 `package.json` 中，运行：
```bash
npm install
```

### 问题 2：启动失败 - ".output/server/index.mjs not found"

**原因**：构建步骤失败或未完成

**解决方案**：
1. 检查 Railway 构建日志
2. 确认 `npm run build` 成功完成
3. 确认 `.output/server/index.mjs` 文件被生成

### 问题 3：应用启动但无法访问

**解决方案**：
1. 检查 Railway 分配的端口是否正确
2. 确认健康检查路径 `/` 返回 200 状态码
3. 查看 Railway 部署日志中的错误信息

### 问题 4：环境变量未生效

**解决方案**：
1. 在 Railway Dashboard 中双击检查所有环境变量
2. 确保 `VITE_` 前缀的变量在构建时可用
3. 重新部署以应用环境变量更改

## 验证部署成功

部署成功后，你应该能够：
1. 访问 Railway 提供的 URL
2. 看到登录页面
3. 使用 Supabase 认证登录
4. 访问所有功能页面（调度、车队、订单等）

## 架构说明

你的应用现在使用：
- **前端框架**：React + TanStack Router
- **构建工具**：Vite + TanStack Start
- **数据库**：Supabase (PostgreSQL)
- **认证**：Supabase Auth
- **部署平台**：Railway
- **服务器**：Node.js (Nitro preset)

旧的 `server.js` 使用的是：
- Express + Google Cloud Firestore（已废弃）

## 下一步

部署成功后，你可能还需要：
1. 配置自定义域名
2. 设置 HTTPS
3. 配置 Supabase RLS 策略
4. 运行数据库迁移（如果还没有）
