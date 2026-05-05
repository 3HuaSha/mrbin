# Railway 部署测试脚本
# 在推送到 Railway 之前运行此脚本进行本地测试

Write-Host "🚀 开始测试 Railway 部署配置..." -ForegroundColor Cyan
Write-Host ""

# 步骤 1: 检查 Node.js 版本
Write-Host "📋 步骤 1: 检查 Node.js 版本" -ForegroundColor Yellow
node --version
npm --version
Write-Host ""

# 步骤 2: 清理旧的构建文件
Write-Host "🧹 步骤 2: 清理旧的构建文件" -ForegroundColor Yellow
if (Test-Path ".output") {
    Remove-Item -Recurse -Force ".output"
    Write-Host "✅ 已删除 .output 目录" -ForegroundColor Green
}
Write-Host ""

# 步骤 3: 安装依赖
Write-Host "📦 步骤 3: 安装依赖" -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 依赖安装失败！" -ForegroundColor Red
    exit 1
}
Write-Host "✅ 依赖安装成功" -ForegroundColor Green
Write-Host ""

# 步骤 4: 构建项目
Write-Host "🔨 步骤 4: 构建项目" -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 构建失败！" -ForegroundColor Red
    exit 1
}
Write-Host "✅ 构建成功" -ForegroundColor Green
Write-Host ""

# 步骤 5: 检查构建输出
Write-Host "🔍 步骤 5: 检查构建输出" -ForegroundColor Yellow
if (Test-Path ".output/server/index.mjs") {
    Write-Host "✅ 找到 .output/server/index.mjs" -ForegroundColor Green
} else {
    Write-Host "❌ 未找到 .output/server/index.mjs" -ForegroundColor Red
    exit 1
}

if (Test-Path ".output/public") {
    $publicFiles = Get-ChildItem ".output/public" -Recurse | Measure-Object
    Write-Host "✅ 找到 .output/public 目录 ($($publicFiles.Count) 个文件)" -ForegroundColor Green
} else {
    Write-Host "⚠️  未找到 .output/public 目录" -ForegroundColor Yellow
}
Write-Host ""

# 步骤 6: 测试启动服务器
Write-Host "🚀 步骤 6: 测试启动服务器" -ForegroundColor Yellow
Write-Host "正在启动服务器... (按 Ctrl+C 停止)" -ForegroundColor Cyan
Write-Host "访问 http://localhost:3000 测试应用" -ForegroundColor Cyan
Write-Host ""

npm run start
