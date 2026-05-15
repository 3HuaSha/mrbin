-- 为订单表添加桶号字段
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS bin_number TEXT;
