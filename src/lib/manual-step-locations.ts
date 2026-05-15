/**
 * 手动步骤常用地点配置
 * 这些地点会在地图上显示为固定标记
 * businessType: 'garbage' = 只在垃圾桶业务显示, 'brick' = 只在砖业务显示, 'all' = 两种都显示
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
  type: 'depot' | 'transfer_station' | 'dump_site' | 'material_site' | 'brick_yard' | 'brick_factory';
  icon: string; // emoji图标
  businessType: 'garbage' | 'brick' | 'all'; // 属于哪种业务
  brand?: string; // 砖厂品牌 (仅 brick_factory 类型)
}

// ============ 垃圾桶业务地点 ============

const GARBAGE_LOCATIONS: ManualStepLocation[] = [
  {
    id: '3445',
    name: '3445 Kennedy Depot',
    shortName: '3445',
    fullAddress: '3445 Kennedy Rd, Scarborough, ON M1V 4Y3',
    coordinates: { lat: 43.821044, lng: -79.304742 },
    type: 'depot',
    icon: '🏢',
    businessType: 'garbage',
  },
  {
    id: '12441',
    name: '12441 Woodbine Depot',
    shortName: '12441',
    fullAddress: '12441 Woodbine Ave, Gormley, ON L4A 2K4',
    coordinates: { lat: 43.948446, lng: -79.374072 },
    type: 'depot',
    icon: '🏢',
    businessType: 'garbage',
  },
  {
    id: 'york1_300',
    name: 'YORK1 Nugget Transfer Station',
    shortName: 'york1 300',
    fullAddress: 'YORK1 Nugget Transfer Station, 300 Nugget Ave, Scarborough, ON M1S 4A4',
    coordinates: { lat: 43.797395, lng: -79.249517 },
    type: 'transfer_station',
    icon: '♻',
    businessType: 'garbage',
  },
  {
    id: 'york1_whitby',
    name: 'YORK1 Warren Transfer Station',
    shortName: 'york1 whitby',
    fullAddress: 'YORK1 Warren Transfer Station, 113 Warren Rd, Whitby, ON L1N 2C4',
    coordinates: { lat: 43.878177, lng: -78.917902 },
    type: 'transfer_station',
    icon: '♻',
    businessType: 'garbage',
  },
  {
    id: 'maple_waste',
    name: 'Maple Transfer & Recycling',
    shortName: 'maple waste',
    fullAddress: 'Maple Transfer & Recycling Inc., 10525 Keele St, Maple, ON L6A 3Y9',
    coordinates: { lat: 43.868360, lng: -79.513730 },
    type: 'transfer_station',
    icon: '♻',
    businessType: 'garbage',
  },
  {
    id: '63a',
    name: '63A Medulla Dump Site',
    shortName: '63A',
    fullAddress: '63A Medulla Ave, Etobicoke, ON M8Z 5L6',
    coordinates: { lat: 43.625163, lng: -79.546445 },
    type: 'dump_site',
    icon: '♻',
    businessType: 'garbage',
  },
  {
    id: 'draglam',
    name: 'Draglam Salt Vaughan',
    shortName: 'draglam',
    fullAddress: 'Draglam Salt, 401 Bowes Rd, Vaughan, ON L4K 1J5',
    coordinates: { lat: 43.813181, lng: -79.494187 },
    type: 'material_site',
    icon: '♻',
    businessType: 'garbage',
  },
  {
    id: 'draglam_brampton',
    name: 'Draglam Salt Brampton',
    shortName: 'draglam brampton',
    fullAddress: 'Draglam Salt, 19 Delta Park Blvd, Brampton, ON L6T 5E7',
    coordinates: { lat: 43.738057, lng: -79.684882 },
    type: 'material_site',
    icon: '♻',
    businessType: 'garbage',
  },
];

// ============ 砖业务场地 (公司自己的四个场地) ============

const BRICK_YARDS: ManualStepLocation[] = [
  {
    id: 'yard_3445',
    name: '3445 Kennedy 场地',
    shortName: '3445',
    fullAddress: '3445 Kennedy Rd, Scarborough, ON M1V 4Y3',
    coordinates: { lat: 43.821044, lng: -79.304742 },
    type: 'brick_yard',
    icon: '🟢',
    businessType: 'brick',
  },
  {
    id: 'yard_12441',
    name: '12441 Woodbine 场地',
    shortName: '12441',
    fullAddress: '12441 Woodbine Ave, Gormley, ON L4A 2K4',
    coordinates: { lat: 43.948446, lng: -79.374072 },
    type: 'brick_yard',
    icon: '🟢',
    businessType: 'brick',
  },
  {
    id: 'yard_2967',
    name: '2967 Kennedy 场地',
    shortName: '2967',
    fullAddress: '2967 Kennedy Rd, Scarborough, ON M1V 1S9',
    coordinates: { lat: 43.7756, lng: -79.2621 },
    type: 'brick_yard',
    icon: '🟢',
    businessType: 'brick',
  },
  {
    id: 'yard_150clark',
    name: '150 Clark 场地',
    shortName: '150 Clark',
    fullAddress: '150 Clark Blvd, Brampton, ON L6T 4Y8',
    coordinates: { lat: 43.7015, lng: -79.7240 },
    type: 'brick_yard',
    icon: '🟢',
    businessType: 'brick',
  },
];

// ============ 砖厂地点 ============

const BRICK_FACTORIES: ManualStepLocation[] = [
  // Unilock 系列
  {
    id: 'unilock_georgetown',
    name: 'UNILOCK Georgetown',
    shortName: 'UNILOCK (GEORGETOWN)',
    fullAddress: '287 Armstrong Ave., Georgetown, ON L7G 4X6',
    coordinates: { lat: 43.6526, lng: -79.9181 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Unilock',
  },
  {
    id: 'unilock_ayr',
    name: 'UNILOCK Ayr',
    shortName: 'UNILOCK (AYR)',
    fullAddress: '2977 Cedar Creek Rd RR#1, Ayr, ON N0B 1E0',
    coordinates: { lat: 43.2834, lng: -80.4494 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Unilock',
  },
  {
    id: 'unilock_barrie',
    name: 'UNILOCK Barrie',
    shortName: 'UNILOCK (BARRIE)',
    fullAddress: '441 Salem Rd, Barrie, ON L9J 0C8',
    coordinates: { lat: 44.3620, lng: -79.7200 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Unilock',
  },
  {
    id: 'unilock_gormley',
    name: 'UNILOCK Gormley',
    shortName: 'UNILOCK (GORMLEY)',
    fullAddress: '37 Gormley Rd., Gormley, ON L0H 1G0',
    coordinates: { lat: 43.9470, lng: -79.3730 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Unilock',
  },
  {
    id: 'unilock_pickering',
    name: 'UNILOCK Pickering',
    shortName: 'UNILOCK (PICKERING)',
    fullAddress: '1890 Clements Rd., Pickering, ON L1W 3R8',
    coordinates: { lat: 43.8370, lng: -79.0710 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Unilock',
  },
  // Permacon 系列
  {
    id: 'permacon_cambridge',
    name: 'PERMACON Cambridge',
    shortName: 'PERMACON (CAMBRIDGE)',
    fullAddress: '1081 Rife Rd, Cambridge, ON N1R 5S3',
    coordinates: { lat: 43.3870, lng: -80.3560 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Permacon',
  },
  {
    id: 'permacon_milton',
    name: 'PERMACON Milton',
    shortName: 'PERMACON (MILTON)',
    fullAddress: '8375 5 Side Rd, Milton, ON L7J 0A1',
    coordinates: { lat: 43.5280, lng: -79.8830 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Permacon',
  },
  {
    id: 'permacon_bolton',
    name: 'PERMACON Bolton',
    shortName: 'PERMACON (BOLTON)',
    fullAddress: '3 Betomat Ct, Bolton, ON L7E 2V9',
    coordinates: { lat: 43.8810, lng: -79.7380 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Permacon',
  },
  {
    id: 'permacon_woodstock',
    name: 'PERMACON Woodstock',
    shortName: 'PERMACON (WOODSTOCK)',
    fullAddress: '201 Universal Rd, Woodstock, ON N4S 7W3',
    coordinates: { lat: 43.1280, lng: -80.7560 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Permacon',
  },
  // Armtec 系列
  {
    id: 'armtec_cambridge',
    name: 'ARMTEC Cambridge',
    shortName: 'ARMTEC (CAMBRIDGE)',
    fullAddress: '605 Sheldon Dr, Cambridge, ON N1T 2K1',
    coordinates: { lat: 43.4050, lng: -80.3250 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Armtec',
  },
  {
    id: 'armtec_guelph',
    name: 'ARMTEC Guelph',
    shortName: 'ARMTEC (GUELPH)',
    fullAddress: '41 George St, Guelph, ON N1H 1S5',
    coordinates: { lat: 43.5480, lng: -80.2530 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Armtec',
  },
  {
    id: 'armtec_peterborough',
    name: 'ARMTEC Peterborough',
    shortName: 'ARMTEC (PETERBOROUGH)',
    fullAddress: '975 ON-7, Peterborough, ON K9J 6X7',
    coordinates: { lat: 44.2870, lng: -78.3560 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Armtec',
  },
  // Oaks / Triple H 系列
  {
    id: 'oaks_markham',
    name: 'OAKS Markham',
    shortName: 'OAKS (MARKHAM)',
    fullAddress: '455 Rodick Rd, Markham, ON L6G 1B2',
    coordinates: { lat: 43.9180, lng: -79.2620 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Oaks',
  },
  {
    id: 'oaks_brampton',
    name: 'OAKS Brampton',
    shortName: 'OAKS (BRAMPTON)',
    fullAddress: '225 Wanless Dr, Brampton, ON L7A 1E9',
    coordinates: { lat: 43.7190, lng: -79.8020 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Oaks',
  },
  {
    id: 'tripleh_putnam',
    name: 'TRIPLE H Putnam',
    shortName: 'TRIPLE H (PUTNAM)',
    fullAddress: '4366 Breen Rd, Putnam, ON N0L 2B0',
    coordinates: { lat: 42.9680, lng: -81.1950 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Triple H',
  },
  {
    id: 'tripleh_london',
    name: 'TRIPLE H London',
    shortName: 'TRIPLE H (LONDON)',
    fullAddress: '1859 Crumlin Sideroad, London, ON N5V 3B8',
    coordinates: { lat: 43.0250, lng: -81.1780 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Triple H',
  },
  // BW 系列
  {
    id: 'bw_woodbridge',
    name: 'BW Woodbridge',
    shortName: 'BW (WOODBRIDGE)',
    fullAddress: '8821 Weston Rd, Woodbridge, ON L4L 0K9',
    coordinates: { lat: 43.8180, lng: -79.5530 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'BW',
  },
  {
    id: 'bw_uxbridge',
    name: 'BW Uxbridge',
    shortName: 'BW (UXBRIDGE)',
    fullAddress: '65 Anderson Blvd., Uxbridge, ON L9P 0C7',
    coordinates: { lat: 44.1080, lng: -79.1230 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'BW',
  },
  // 其他建材与石材地点
  {
    id: 'oakville_mississauga',
    name: 'OAKVILLE Mississauga',
    shortName: 'OAKVILLE (MISSISSAUGA)',
    fullAddress: '960 Kamato Rd, Mississauga, ON L4W 2R6',
    coordinates: { lat: 43.6280, lng: -79.6130 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'browns_sudbury',
    name: "BROWN'S Sudbury",
    shortName: "BROWN'S (SUDBURY)",
    fullAddress: '3075 Herold Dr, Sudbury, ON P3E 6K9',
    coordinates: { lat: 46.4730, lng: -81.0280 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'rymar_mississauga',
    name: 'RYMAR Mississauga',
    shortName: 'RYMAR (MISSISSAUGA)',
    fullAddress: 'Unit 5, 3615 Laird Road, Mississauga, ON L5L 5Z8',
    coordinates: { lat: 43.5530, lng: -79.6580 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'sika_cambridge',
    name: 'SIKA Cambridge',
    shortName: 'SIKA (CAMBRIDGE)',
    fullAddress: '141 Shearson Crescent, Cambridge, ON N1T 1J3',
    coordinates: { lat: 43.4120, lng: -80.3480 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'bvs_maple',
    name: 'BVS Maple',
    shortName: 'BVS (MAPLE)',
    fullAddress: '12350 Keele St, Maple, ON L6A 2C4',
    coordinates: { lat: 43.8780, lng: -79.5130 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'voyage_scarborough',
    name: 'VOYAGE Scarborough',
    shortName: 'VOYAGE (SCARBOROUGH)',
    fullAddress: '189 Milner Ave, Toronto, ON M1S 3R1',
    coordinates: { lat: 43.7920, lng: -79.2680 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'stonerox_stouffville',
    name: 'STONEROX Stouffville',
    shortName: 'STONEROX (STOUFFVILLE)',
    fullAddress: '5291 Bethesda Rd., Stouffville, ON L4A 7X3',
    coordinates: { lat: 43.9680, lng: -79.2530 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'rinox_qc',
    name: 'RINOX QC',
    shortName: 'RINOX (QC)',
    fullAddress: '3200 Bd des Entreprises, Terrebonne, QC J5N 3H4',
    coordinates: { lat: 45.7280, lng: -73.6180 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'banas_bolton',
    name: 'BANAS STONE Bolton',
    shortName: 'BANAS STONE (BOLTON)',
    fullAddress: '8144 King Street, Bolton, ON L7E 0T8',
    coordinates: { lat: 43.8780, lng: -79.7350 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'toolway_woodbridge',
    name: 'TOOLWAY Woodbridge',
    shortName: 'TOOLWAY (WOODBRIDGE)',
    fullAddress: "280 Hunter's Valley Rd #1, Woodbridge, ON L4H 3V9",
    coordinates: { lat: 43.8280, lng: -79.5880 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'techoblock_vaughan',
    name: 'TECHO-BLOCK Vaughan',
    shortName: 'TECHO-BLOCK (VAUGHAN)',
    fullAddress: '10 Freshway Dr, Vaughan, ON L4K 1S3',
    coordinates: { lat: 43.8080, lng: -79.4780 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'porcea_bolton',
    name: 'PORCEA Bolton',
    shortName: 'PORCEA (BOLTON)',
    fullAddress: '12393 Coleraine Dr, Bolton, ON L7E 3A9',
    coordinates: { lat: 43.8480, lng: -79.7180 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'cfc_mississauga',
    name: 'CFC Mississauga',
    shortName: 'CFC (MISSISSAUGA)',
    fullAddress: '5115 Satellite Dr, Mississauga, ON L4W 5B6',
    coordinates: { lat: 43.6380, lng: -79.6280 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'alliance_gator',
    name: 'ALLIANCE GATOR Scarborough',
    shortName: 'ALLIANCE GATOR (SCARBOROUGH)',
    fullAddress: '780 Tapscott Rd Unit 1, Scarborough, ON M1X 1B8',
    coordinates: { lat: 43.8180, lng: -79.2280 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'hanes_qc',
    name: 'HANES Mount Royal',
    shortName: 'HANES',
    fullAddress: '5675 Royalmount Ave., Mount Royal, QC H4P 1K3',
    coordinates: { lat: 45.4980, lng: -73.6580 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
  {
    id: 'northyork_iron',
    name: 'NORTH YORK IRON',
    shortName: 'NORTH YORK IRON',
    fullAddress: '1100 Flint Rd, North York, ON M3J 2J5',
    coordinates: { lat: 43.7680, lng: -79.4880 },
    type: 'brick_factory',
    icon: '🏭',
    businessType: 'brick',
    brand: 'Other',
  },
];

// ============ 合并所有地点 ============

export const MANUAL_STEP_LOCATIONS: ManualStepLocation[] = [
  ...GARBAGE_LOCATIONS,
  ...BRICK_YARDS,
  ...BRICK_FACTORIES,
];

// 根据业务类型过滤地点
export function getLocationsForBusinessType(businessType: 'garbage' | 'brick'): ManualStepLocation[] {
  return MANUAL_STEP_LOCATIONS.filter(loc =>
    loc.businessType === businessType || loc.businessType === 'all'
  );
}

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
  'material_site': '物料站',
  'brick_yard': '砖场地',
  'brick_factory': '砖厂',
};
