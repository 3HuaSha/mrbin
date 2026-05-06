# Samsara API 权限配置指南

## 问题
当前 API Token 缺少 Routes write permissions，导致无法计算 ETA。

错误信息：
```
Token requires Routes write permissions to call this endpoint
```

## 解决方案

### 步骤 1: 登录 Samsara Dashboard
1. 访问 [Samsara Dashboard](https://cloud.samsara.com/)
2. 使用管理员账号登录

### 步骤 2: 进入 API Tokens 设置
1. 点击左侧导航栏的 **设置图标**（齿轮图标）
2. 向下滚动找到 **API Tokens** 部分
3. 找到当前使用的 API Token（或创建新的）

### 步骤 3: 添加 Routes 权限
1. 点击 API Token 旁边的 **编辑** 按钮
2. 在权限列表中找到 **Driver Workflow** 类别
3. 勾选以下权限：
   - ✅ **Write Routes** - 创建和修改路线
   - ✅ **Read Routes** - 读取路线信息（如果还没勾选）
4. 点击 **保存** 按钮

### 步骤 4: 更新环境变量（如果创建了新 Token）
如果你创建了新的 API Token，需要更新以下位置：

#### Railway 环境变量
1. 登录 [Railway Dashboard](https://railway.app/)
2. 选择你的项目
3. 进入 **Variables** 标签
4. 更新或添加：
   - `VITE_SAMSARA_TOKEN=your_new_token_here`
   - `SAMSARA_API_KEY=your_new_token_here`
5. 保存后 Railway 会自动重新部署

#### 本地 .env 文件（如果需要本地测试）
```env
VITE_SAMSARA_TOKEN=your_new_token_here
SAMSARA_API_KEY=your_new_token_here
```

## 验证
配置完成后，访问实时地图页面，点击 "计算 ETA" 按钮，应该可以正常工作。

## 所需权限总结
为了完整使用系统功能，API Token 需要以下权限：

### Telematics (车辆遥测)
- ✅ Read Vehicle Locations - 读取车辆位置

### Driver Workflow (司机工作流)
- ✅ Read Routes - 读取路线
- ✅ Write Routes - 创建和修改路线

## 注意事项
1. 只有管理员账号才能修改 API Token 权限
2. 修改权限后，Token 立即生效，无需等待
3. 建议为生产环境和开发环境使用不同的 API Token
4. 定期检查 Token 的使用情况和权限范围

## 相关文档
- [Samsara API 文档](https://developers.samsara.com/)
- [创建路线 API](https://developers.samsara.com/docs/creating-routes-via-api)
- [API Token 管理](https://developers.samsara.com/docs/getting-started)
