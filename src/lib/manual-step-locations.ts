/**
 * 手动步骤常用地点配置
 * 这些地点会在地图上显示为固定标记
 */

export interface ManualStepLocation {
  id: string;
  name: string;
  shortName: string; // 用于手动步骤表单的简短名称
  fullAddress: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  type: 'depot' | 'transfer_station' | 'dump_site' | 'material_site';
  icon: string; // emoji图标
}

export const MANUAL_STEP_LOCATIONS: ManualStepLocation[] = [
  {
    id: '3445',
    name: '3445 Kennedy Depot',
    shortName: '3445',
    fullAddress: '3445 Kennedy Rd, Scarborough, ON M1V 4Y3',
    coordinates: { lat: 43.8089, lng: -79.2865 },
    type: 'depot',
    icon: '🏢'
  },
  {
    id: '12441',
    name: '12441 Woodbine Depot',
    shortName: '12441',
    fullAddress: '12441 Woodbine Ave, Gormley, ON L4A 2K4',
    coordinates: { lat: 43.9876, lng: -79.3456 },
    type: 'depot',
    icon: '🏢'
  },
  {
    id: 'york1_300',
    name: 'YORK1 Nugget Transfer Station',
    shortName: 'york1 300',
    fullAddress: 'YORK1 Nugget Transfer Station, 300 Nugget Ave, Scarborough, ON M1S 4A4',
    coordinates: { lat: 43.7891, lng: -79.2456 },
    type: 'transfer_station',
    icon: '♻️'
  },
  {
    id: 'york1_whitby',
    name: 'YORK1 Warren Transfer Station',
    shortName: 'york1 whitby',
    fullAddress: 'YORK1 Warren Transfer Station, 113 Warren Rd, Whitby, ON L1N 2C4',
    coordinates: { lat: 43.8765, lng: -78.9234 },
    type: 'transfer_station',
    icon: '♻️'
  },
  {
    id: 'maple_waste',
    name: 'Maple Transfer & Recycling',
    shortName: 'maple waste',
    fullAddress: 'Maple Transfer & Recycling Inc., 10525 Keele St, Maple, ON L6A 3Y9',
    coordinates: { lat: 43.8567, lng: -79.5234 },
    type: 'transfer_station',
    icon: '♻️'
  },
  {
    id: '63a',
    name: '63A Medulla Dump Site',
    shortName: '63A',
    fullAddress: '63A Medulla Ave, Etobicoke, ON M8Z 5L6',
    coordinates: { lat: 43.6234, lng: -79.5123 },
    type: 'dump_site',
    icon: '♻️'
  },
  {
    id: 'draglam',
    name: 'Draglam Salt Vaughan',
    shortName: 'draglam',
    fullAddress: 'Draglam Salt, 401 Bowes Rd, Vaughan, ON L4K 1J5',
    coordinates: { lat: 43.7912, lng: -79.4567 },
    type: 'material_site',
    icon: '♻️'
  },
  {
    id: 'draglam_brampton',
    name: 'Draglam Salt Brampton',
    shortName: 'draglam brampton',
    fullAddress: 'Draglam Salt, 19 Delta Park Blvd, Brampton, ON L6T 5E7',
    coordinates: { lat: 43.7123, lng: -79.7345 },
    type: 'material_site',
    icon: '♻️'
  }
];

// 根据shortName查找地点
export function findLocationByShortName(shortName: string): ManualStepLocation | undefined {
  return MANUAL_STEP_LOCATIONS.find(loc => 
    loc.shortName.toLowerCase() === shortName.toLowerCase()
  );
}

// 根据地址查找地点（用于ETA计算时匹配）
export function findLocationByAddress(address: string): ManualStepLocation | undefined {
  const normalizedAddress = address.toLowerCase().trim();
  return MANUAL_STEP_LOCATIONS.find(loc => 
    loc.shortName.toLowerCase() === normalizedAddress ||
    loc.fullAddress.toLowerCase().includes(normalizedAddress) ||
    normalizedAddress.includes(loc.shortName.toLowerCase())
  );
}

// 获取地点的完整地址（用于ETA计算）
export function getFullAddress(shortName: string): string {
  const location = findLocationByShortName(shortName);
  return location ? location.fullAddress : shortName;
}

// 地点类型的中文名称
export const LOCATION_TYPE_NAMES: Record<string, string> = {
  'depot': '仓库',
  'transfer_station': '转运站',
  'dump_site': '倾倒点',
  'material_site': '物料站'
};
