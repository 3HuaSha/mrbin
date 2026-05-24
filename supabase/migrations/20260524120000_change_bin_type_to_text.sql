-- ============================================================
-- 步骤1: 先单独执行以下语句（必须先提交 enum 变更）
-- 在 Supabase SQL Editor 中逐条执行
-- ============================================================

-- 1. bin_type 从 enum 改为 text
ALTER TABLE public.orders ALTER COLUMN bin_type DROP DEFAULT;
ALTER TABLE public.orders ALTER COLUMN bin_type TYPE text USING bin_type::text;

-- 2. 删除旧的 bin_type enum 类型（如果不再有其他列引用）
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

-- 3. 添加 material 到 business_type enum（必须单独提交后才能使用）
ALTER TYPE public.business_type ADD VALUE IF NOT EXISTS 'material';

-- ============================================================
-- 步骤2: enum 值提交后，再执行以下语句
-- ============================================================

-- 4. 修复已创建的砂石料订单的 business_type
UPDATE public.orders SET business_type = 'material' WHERE type = 'material' AND business_type != 'material';

-- 5. 更新 CHECK 约束
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS check_brick_order_type;
ALTER TABLE public.orders ADD CONSTRAINT check_brick_order_type
  CHECK (
    (business_type = 'brick' AND brick_order_type IS NOT NULL) OR
    (business_type IN ('garbage', 'material') AND brick_order_type IS NULL)
  );
