-- 添加 30 yard 桶尺寸到 bin_size 枚举
ALTER TYPE public.bin_size ADD VALUE IF NOT EXISTS '30' AFTER '20';
