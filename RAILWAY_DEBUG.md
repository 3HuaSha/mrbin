# Railway 健康检查失败 - 调试指南

## 问题
服务器启动了，但健康检查失败（无法访问 `/` 路径）

## 可能的原因

### 1. 端口配置问题
Railway 使用环境变量 `PORT` 来指定端口，TanStack Start 可能没有正确读取。

### 2. 服务器没有正确启动
`dist/server/server.js` 可能不是正确的入口文件。

### 3. 需要查看的日志
在 Railway Dashboard → Deployments → 点击最新部署 → 查看 **Runtime Logs**（不是 Build Logs）

应该能看到：
- 服务器是否真的在运行
- 监听在哪个端口
- 是否有错误信息

## 快速修复步骤

### 步骤 1: 检查 dist 目录结构
在 Railway 的 Build Logs 最后，添加一个命令来查看构建输出：

```bash
ls -la dist/
ls -la dist/server/
```

### 步骤 2: 检查可能的入口文件
TanStack Start 的输出可能是：
- `dist/server/server.js`
- `dist/server/index.js`
- `dist/server/index.mjs`
- `.output/server/index.mjs`（如果使用 Nitro）

### 步骤 3: 创建自定义服务器
如果默认输出不工作，需要创建一个自定义服务器文件。

## 需要的信息

请提供以下信息：

1. **Runtime Logs**（运行时日志）
   - 在 Railway Dashboard 中查看
   - 应该显示服务器启动信息或错误

2. **Build Logs 的最后部分**
   - 特别是构建完成后的输出
   - 看看生成了哪些文件

3. **环境变量**
   - 确认 `PORT` 环境变量是否设置
   - Railway 会自动设置，但需要确认

## 临时解决方案

如果需要快速修复，可以：

1. 在 `railway.json` 中禁用健康检查（不推荐）
2. 创建一个简单的 Express 服务器包装 TanStack Start 的输出
3. 使用 Vercel 或 Netlify 等其他平台（它们对 TanStack Start 有更好的支持）
