# Railway 部署说明 🚂

## 问题原因

你的项目之前有两个服务器配置文件：
1. **`server.js`** - 旧的 Google Cloud Firestore 代码（已废弃）
2. **TanStack Start** - 现在使用的框架（通过 Vite 构建）

这导致 Railway 不知道该使用哪个，所以部署失败了。

## 已完成的修复

✅ 已将旧的 `server.js` 重命名为 `server.js.old`（备份）
✅ 已创建部署检查清单和测试脚本

## 快速部署步骤

### 方法 1：直接推送（最简单）

如果你相信配置正确，直接推送：

```bash
git add .
git commit -m "修复 Railway 部署配置"
git push
```

然后在 Railway Dashboard 查看部署日志。

### 方法 2：先本地测试（推荐）

在推送之前先本地测试：

```powershell
# 运行测试脚本
.\test-build.ps1
```

或者手动测试：

```bash
# 1. 清理旧文件
rm -rf .output

# 2. 安装依赖
npm install

# 3. 构建项目
npm run build

# 4. 启动服务器
npm run start
```

如果本地能访问 http://localhost:3000，说明配置正确。

## Railway 环境变量设置

⚠️ **重要**：在 Railway Dashboard 中设置这些环境变量：

### 进入设置页面
1. 打开 Railway Dashboard
2. 选择你的项目
3. 点击 **Variables** 标签

### 添加以下变量

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

💡 **提示**：可以直接复制粘贴，每行一个变量。

## 部署后检查

部署成功后，你应该能：
1. ✅ 访问 Railway 提供的 URL
2. ✅ 看到登录页面
3. ✅ 使用 Supabase 账号登录
4. ✅ 访问所有功能（调度、车队、订单等）

## 常见问题

### Q1: 构建失败，提示找不到模块

**A**: 运行 `npm install` 确保所有依赖都安装了。

### Q2: 启动失败，提示找不到 `.output/server/index.mjs`

**A**: 构建步骤失败了。检查 Railway 的构建日志，看看 `npm run build` 是否成功。

### Q3: 应用启动了但无法访问

**A**: 检查：
- Railway 的环境变量是否都设置了
- 特别是 `VITE_` 开头的变量
- 在 Railway Dashboard 点击 "Redeploy" 重新部署

### Q4: 登录失败或 Supabase 错误

**A**: 检查：
- `SUPABASE_URL` 和 `SUPABASE_PUBLISHABLE_KEY` 是否正确
- 在 Supabase Dashboard 确认项目没有暂停
- 检查浏览器控制台的错误信息

## 查看日志

在 Railway Dashboard 中：
1. **Build Logs** - 查看构建过程
2. **Deploy Logs** - 查看服务器启动日志
3. **Runtime Logs** - 查看运行时日志

## 需要帮助？

如果还是不行，提供以下信息：
1. Railway 的构建日志（Build Logs）
2. Railway 的部署日志（Deploy Logs）
3. 浏览器控制台的错误信息
4. 具体的错误提示

## 技术栈说明

你的应用现在使用：
- **前端**: React + TanStack Router
- **构建**: Vite + TanStack Start
- **数据库**: Supabase (PostgreSQL)
- **认证**: Supabase Auth
- **部署**: Railway
- **服务器**: Node.js

旧的 `server.js` 使用的是 Express + Google Cloud Firestore，已经不再使用。
