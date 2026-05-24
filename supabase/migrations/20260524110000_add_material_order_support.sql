-- 砂石料订单支持：添加装料地点字段
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS load_location TEXT;

COMMENT ON COLUMN public.orders.load_location IS '装料地点，仅用于砂石料(material)订单';
