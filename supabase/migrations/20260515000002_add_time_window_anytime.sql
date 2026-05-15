-- 添加 ANYTIME 到 time_window 枚举，用于没有明确时间窗口的订单
ALTER TYPE public.time_window ADD VALUE IF NOT EXISTS 'ANYTIME' AFTER 'custom';
