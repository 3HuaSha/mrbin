// 业务常量与展示工具

// 业务类型
export type BusinessType = 'garbage' | 'brick' | 'material';

export const BUSINESS_TYPES = [
  { value: "garbage" as const, label: "垃圾桶+砂石料", emoji: "🗑️", icon: "Trash2" },
  { value: "brick" as const, label: "砖块业务", emoji: "🧱", icon: "Package" },
] as const;

// 砖块订单类型
export type BrickOrderType = 'pickup_from_factory' | 'delivery_to_customer' | 'factory_to_customer';

export const BRICK_ORDER_TYPES = [
  { value: "pickup_from_factory" as const, label: "从砖厂取砖", emoji: "🏭", description: "从砖厂取砖到公司场地" },
  { value: "delivery_to_customer" as const, label: "送砖给客户", emoji: "🚚", description: "从公司场地送砖给客户" },
  { value: "factory_to_customer" as const, label: "砖厂直送客户", emoji: "🏭", description: "从砖厂取砖后直接送到客户" },
] as const;

export const ORDER_TYPES = [
  { value: "delivery", label: "送桶", emoji: "🟢", className: "bg-type-delivery text-type-delivery-foreground" },
  { value: "pickup", label: "收桶", emoji: "🔴", className: "bg-type-pickup text-type-pickup-foreground" },
  { value: "swap", label: "换桶", emoji: "🔵", className: "bg-type-swap text-type-swap-foreground" },
  { value: "material", label: "砂石料", emoji: "🟡", className: "bg-type-material text-type-material-foreground" },
] as const;

export const BIN_SIZES = ["14", "20", "30", "40"] as const;

export const TIME_WINDOWS = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
  { value: "7-9", label: "7-9" },
  { value: "custom", label: "自定义" },
] as const;

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "待排班",
  assigned: "已排班",
  in_progress: "进行中",
  done: "已完成",
  cancelled: "已取消",
};

export const ORDER_STATUS_CLASS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  assigned: "bg-status-assigned/15 text-status-assigned border border-status-assigned/30",
  in_progress: "bg-status-progress/15 text-status-progress border border-status-progress/30",
  done: "bg-green-100 text-green-800 border border-green-400 font-semibold",
  cancelled: "bg-gray-200 text-gray-500 border border-gray-400 line-through",
};

export const STEP_TYPE_LABEL: Record<string, string> = {
  depot_pickup: "去 Depot 取桶",
  customer_delivery: "送到客户",
  customer_pickup: "去客户取桶",
  dump_site: "去垃圾场倒垃圾",
  load_material: "装料",
  unload_material: "送料",
};

export const STEP_TYPE_EMOJI: Record<string, string> = {
  depot_pickup: "🏭",
  customer_delivery: "📦",
  customer_pickup: "📥",
  dump_site: "♻️",
  load_material: "⛏️",
  unload_material: "🚛",
};

export function typeMeta(type: string) {
  return ORDER_TYPES.find((t) => t.value === type) ?? ORDER_TYPES[0];
}

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// HINO 不能拉 40yd
export function vehicleCanCarry(vehicleType: "HINO" | "MACK", binSize: string | null | undefined): boolean {
  if (!binSize) return true;
  if (vehicleType === "HINO" && binSize === "40") return false;
  return true;
}

export function isAMTimeWindow(timeWindow: string, customTime: string | null): boolean {
  const time = timeWindow === "custom" ? (customTime || "") : timeWindow;
  const timeLower = time.toLowerCase();
  if (timeLower.includes('am')) return true;
  if (timeLower.includes('noon') || timeLower.includes('中午')) return true;
  return false;
}

export function isPMTimeWindow(timeWindow: string, customTime: string | null): boolean {
  const time = timeWindow === "custom" ? (customTime || "") : timeWindow;
  const timeLower = time.toLowerCase();
  if (timeLower.includes('pm')) return true;
  if (!isAMTimeWindow(timeWindow, customTime)) return true;
  return false;
}

// 获取业务类型标签
export function getBusinessTypeLabel(businessType: BusinessType): string {
  return BUSINESS_TYPES.find(t => t.value === businessType)?.label ?? "未知业务";
}

// 获取业务类型图标
export function getBusinessTypeIcon(businessType: BusinessType): string {
  return BUSINESS_TYPES.find(t => t.value === businessType)?.emoji ?? "❓";
}

// 获取砖块订单类型标签
export function getBrickOrderTypeLabel(brickOrderType: BrickOrderType): string {
  return BRICK_ORDER_TYPES.find(t => t.value === brickOrderType)?.label ?? "未知类型";
}

// 获取砖块订单类型图标
export function getBrickOrderTypeIcon(brickOrderType: BrickOrderType): string {
  return BRICK_ORDER_TYPES.find(t => t.value === brickOrderType)?.emoji ?? "❓";
}

// 获取砖块订单类型描述
export function getBrickOrderTypeDescription(brickOrderType: BrickOrderType): string {
  return BRICK_ORDER_TYPES.find(t => t.value === brickOrderType)?.description ?? "";
}
