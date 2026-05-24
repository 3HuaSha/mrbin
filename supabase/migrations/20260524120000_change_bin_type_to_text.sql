-- 将 bin_type 从 enum 改为 text，以支持砂石料自由文本输入
-- 现有枚举值 (garbage, brick, soil, cement, asphalt) 作为普通字符串继续有效

-- 1. 先删除依赖 bin_type enum 的列默认值（如果有）
ALTER TABLE public.orders ALTER COLUMN bin_type DROP DEFAULT;

-- 2. 将列类型从 enum 改为 text
ALTER TABLE public.orders ALTER COLUMN bin_type TYPE text USING bin_type::text;

-- 3. 删除旧的 enum 类型（如果不再有其他列引用它）
-- 先检查是否还有其他列使用该类型
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.udt_name = 'bin_type'
      AND c.table_name != 'orders'
  ) THEN
    DROP TYPE IF EXISTS public.bin_type;
  END IF;
END $$;

-- 4. 添加 material 到 business_type enum
ALTER TYPE public.business_type ADD VALUE IF NOT EXISTS 'material';

-- 5. 修复已创建的砂石料订单的 business_type
UPDATE public.orders SET business_type = 'material' WHERE type = 'material' AND business_type != 'material';

-- 6. 更新 CHECK 约束：material 订单也不需要 brick_order_type
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS check_brick_order_type;
ALTER TABLE public.orders ADD CONSTRAINT check_brick_order_type
  CHECK (
    (business_type = 'brick' AND brick_order_type IS NOT NULL) OR
    (business_type IN ('garbage', 'material') AND brick_order_type IS NULL)
  );
