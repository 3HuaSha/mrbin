# 📍 手动步骤地点标记功能

## 功能概述

在实时地图上显示所有手动步骤常用地点的固定标记，包括仓库、转运站、倾倒点和物料站。这些地点会：
1. 在地图上显示为特殊图标
2. 用于ETA计算时的地址解析
3. 在手动步骤表单中可选择

## 配置的地点

### 🏢 仓库 (Depot)
| 简称 | 名称 | 完整地址 | 图标颜色 |
|------|------|----------|----------|
| 3445 | 3445 Kennedy Depot | 3445 Kennedy Rd, Scarborough, ON M1V 4Y3 | 灰色 |
| 12441 | 12441 Woodbine Depot | 12441 Woodbine Ave, Gormley, ON L4A 2K4 | 灰色 |

### ♻️ 转运站 (Transfer Station)
| 简称 | 名称 | 完整地址 | 图标颜色 |
|------|------|----------|----------|
| york1 300 | YORK1 Nugget Transfer Station | 300 Nugget Ave, Scarborough, ON M1S 4A4 | 绿色 |
| york1 whitby | YORK1 Warren Transfer Station | 113 Warren Rd, Whitby, ON L1N 2C4 | 绿色 |
| york1 brampton | YORK1 Brampton Transfer Station | Brampton, ON | 绿色 |
| maple waste | Maple Transfer & Recycling | 10525 Keele St, Maple, ON L6A 3Y9 | 绿色 |

### 🗑️ 倾倒点 (Dump Site)
| 简称 | 名称 | 完整地址 | 图标颜色 |
|------|------|----------|----------|
| 63A | 63A Medulla Dump Site | 63A Medulla Ave, Etobicoke, ON M8Z 5L6 | 红色 |

### 🧂 物料站 (Material Site)
| 简称 | 名称 | 完整地址 | 图标颜色 |
|------|------|----------|----------|
| draglam | Draglam Salt Vaughan | 401 Bowes Rd, Vaughan, ON L4K 1J5 | 橙色 |
| draglam brampton | Draglam Salt Brampton | 19 Delta Park Blvd, Brampton, ON L6T 5E7 | 橙色 |

## 地图显示效果

### 图标设计
每个地点显示为一个圆形图标，包含：
- **圆形背景**：根据地点类型使用不同颜色
- **Emoji图标**：
  - 🏢 仓库
  - ♻️ 转运站
  - 🗑️ 倾倒点
  - 🧂 物料站
- **名称标签**：显示简称（如"3445"、"york1 300"）
- **连接线**：从圆形到标签的指示线

### 颜色方案
```typescript
仓库 (depot):           灰色 #607D8B
转运站 (transfer_station): 绿色 #4CAF50
倾倒点 (dump_site):      红色 #FF5722
物料站 (material_site):   橙色 #FF9800
```

## 功能集成

### 1. 地图标记
**文件**: `src/components/DispatchMapWidget.tsx`

所有配置的地点会在地图初始化时自动添加标记：
```typescript
MANUAL_STEP_LOCATIONS.forEach(location => {
  const marker = new google.maps.Marker({
    position: location.coordinates,
    map: mapInstance.current,
    icon: createManualLocationIcon(location),
    title: location.name
  });
});
```

**点击标记显示信息**：
- 地点名称
- 地点类型
- 简称
- 完整地址

### 2. ETA计算
**文件**: `src/pages/FleetMapPage.tsx`

当计算ETA时，手动步骤的简称会自动转换为完整地址：
```typescript
import { getFullAddress } from "@/lib/manual-step-locations";

// 手动步骤使用完整地址
address: getFullAddress(s.location) // "3445" -> "3445 Kennedy Rd, Scarborough, ON M1V 4Y3"
```

这确保了Samsara API能够正确解析地址并计算路线。

### 3. 手动步骤表单
**文件**: `src/pages/DispatchPage.tsx`

表单中的地点选项已更新，显示更友好的名称：
```typescript
// 倒垃圾地点选项
{ value: "york1 300", label: "YORK1 Nugget (300)" }
{ value: "63A", label: "63A Medulla" }
{ value: "draglam", label: "Draglam Vaughan" }
{ value: "draglam brampton", label: "Draglam Brampton" }
{ value: "maple waste", label: "Maple Transfer" }
{ value: "york1 whitby", label: "YORK1 Whitby" }
{ value: "york1 brampton", label: "YORK1 Brampton" }
```

## 配置文件

### 文件位置
`src/lib/manual-step-locations.ts`

### 数据结构
```typescript
interface ManualStepLocation {
  id: string;              // 唯一标识符
  name: string;            // 完整名称
  shortName: string;       // 简称（用于表单）
  fullAddress: string;     // 完整地址（用于ETA）
  coordinates: {           // 地图坐标
    lat: number;
    lng: number;
  };
  type: 'depot' | 'transfer_station' | 'dump_site' | 'material_site';
  icon: string;            // Emoji图标
}
```

### 辅助函数

**查找地点**：
```typescript
findLocationByShortName("3445")
// 返回: { id: "3445", name: "3445 Kennedy Depot", ... }
```

**获取完整地址**：
```typescript
getFullAddress("york1 300")
// 返回: "YORK1 Nugget Transfer Station, 300 Nugget Ave, Scarborough, ON M1S 4A4"
```

**按地址查找**：
```typescript
findLocationByAddress("3445")
// 返回: ManualStepLocation对象
```

## 使用场景

### 场景1：添加手动步骤
1. 在排班看板点击 **+** 添加步骤
2. 选择动作：**倒垃圾**
3. 选择地点：**YORK1 Nugget (300)**
4. 系统自动保存简称 `"york1 300"`

### 场景2：计算ETA
1. 点击司机的 **⏰** 按钮
2. 系统读取手动步骤：`location: "york1 300"`
3. 自动转换为完整地址：`"YORK1 Nugget Transfer Station, 300 Nugget Ave, Scarborough, ON M1S 4A4"`
4. 传递给Samsara API计算路线
5. 在地图上显示路线和ETA

### 场景3：查看地图
1. 打开实时地图页面
2. 地图上显示所有固定地点标记
3. 点击标记查看详细信息
4. 不同类型的地点用不同颜色区分

## 添加新地点

如果需要添加新的固定地点，编辑 `src/lib/manual-step-locations.ts`：

```typescript
{
  id: 'new_location',
  name: '新地点名称',
  shortName: '简称',
  fullAddress: '完整地址',
  coordinates: { lat: 43.xxxx, lng: -79.xxxx },
  type: 'transfer_station', // 选择类型
  icon: '♻️' // 选择图标
}
```

**注意事项**：
1. `shortName` 必须与手动步骤表单中的值匹配
2. `fullAddress` 必须是有效的地址，能被Google Maps解析
3. `coordinates` 可以通过Google Maps获取
4. 添加后需要更新 `DispatchPage.tsx` 中的表单选项

## 坐标获取方法

### 方法1：Google Maps
1. 在 [Google Maps](https://maps.google.com) 搜索地址
2. 右键点击地点
3. 选择"这是哪里？"
4. 复制显示的坐标

### 方法2：地址解析
使用Google Geocoding API：
```javascript
const geocoder = new google.maps.Geocoder();
geocoder.geocode({ address: "完整地址" }, (results, status) => {
  if (status === "OK") {
    const location = results[0].geometry.location;
    console.log(`lat: ${location.lat()}, lng: ${location.lng()}`);
  }
});
```

## 技术细节

### 图标生成
使用SVG动态生成图标：
```typescript
function createManualLocationIcon(location: ManualStepLocation): string {
  // 创建包含圆形、emoji和标签的SVG
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'>
      <circle cx='30' cy='25' r='20' fill='${color}'/>
      <text x='30' y='32' font-size='18'>${location.icon}</text>
      <rect x='5' y='48' width='50' height='10' fill='${color}'/>
      <text x='30' y='56' font-size='8'>${location.shortName}</text>
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
```

### 地址匹配逻辑
```typescript
export function findLocationByAddress(address: string): ManualStepLocation | undefined {
  const normalized = address.toLowerCase().trim();
  return MANUAL_STEP_LOCATIONS.find(loc => 
    loc.shortName.toLowerCase() === normalized ||
    loc.fullAddress.toLowerCase().includes(normalized) ||
    normalized.includes(loc.shortName.toLowerCase())
  );
}
```

## 相关文件

- `src/lib/manual-step-locations.ts` - 地点配置文件（新增）
- `src/components/DispatchMapWidget.tsx` - 地图组件（已修改）
- `src/pages/FleetMapPage.tsx` - 实时地图页面（已修改）
- `src/pages/DispatchPage.tsx` - 排班看板页面（已修改）

## 部署

所有修改已完成，准备部署：

```bash
git add .
git commit -m "feat: 添加手动步骤固定地点标记和地址解析"
git push
```

Railway 会自动部署更新。
