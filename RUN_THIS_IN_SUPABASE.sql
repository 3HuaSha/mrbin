-- ============================================
-- 在 Supabase Dashboard 的 SQL Editor 中运行此脚本
-- ============================================

-- 1. 创建常用地点表
CREATE TABLE IF NOT EXISTS public.common_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  type TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 插入常用地点数据
INSERT INTO public.common_locations (name, address, type) VALUES
  ('Kennedy Depot', '3445 Kennedy Rd, Toronto, ON', 'depot'),
  ('Sheppard Yard', '12441 Sheppard Ave, Toronto, ON', 'depot')
ON CONFLICT DO NOTHING;

-- 3. 更新 job_steps 表结构
-- 添加新列
ALTER TABLE public.job_steps 
ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES public.profiles(id);

ALTER TABLE public.job_steps 
ADD COLUMN IF NOT EXISTS scheduled_date DATE;

ALTER TABLE public.job_steps 
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE public.job_steps 
ADD COLUMN IF NOT EXISTS node_type TEXT DEFAULT 'step';

ALTER TABLE public.job_steps 
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.job_steps 
ADD COLUMN IF NOT EXISTS bin_id UUID REFERENCES public.bins(id);

-- 4. 修改现有列的约束
-- 将 assignment_id 改为可选
ALTER TABLE public.job_steps 
ALTER COLUMN assignment_id DROP NOT NULL;

-- 将 location 改为可选
ALTER TABLE public.job_steps 
ALTER COLUMN location DROP NOT NULL;

-- 5. 添加约束检查
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'job_steps_node_type_check'
  ) THEN
    ALTER TABLE public.job_steps 
    ADD CONSTRAINT job_steps_node_type_check 
    CHECK (node_type IN ('order', 'step'));
  END IF;
END $$;

-- 6. 更新现有数据
-- 为已有的 job_steps 填充 driver_id 和 scheduled_date
UPDATE public.job_steps js
SET 
  driver_id = da.driver_id,
  scheduled_date = da.scheduled_date,
  order_id = da.order_id,
  node_type = 'order'
FROM public.dispatch_assignments da
WHERE js.assignment_id = da.id
  AND js.driver_id IS NULL;

-- 7. 创建索引（提升查询性能）
CREATE INDEX IF NOT EXISTS idx_job_steps_driver_date 
ON public.job_steps(driver_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_job_steps_order 
ON public.job_steps(order_id);

CREATE INDEX IF NOT EXISTS idx_job_steps_sequence 
ON public.job_steps(driver_id, scheduled_date, step_number);

-- 8. 设置 RLS 策略
ALTER TABLE public.common_locations ENABLE ROW LEVEL SECURITY;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Enable read for all users" ON public.common_locations;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.common_locations;

-- 创建新策略
CREATE POLICY "Enable read for all users" ON public.common_locations
  FOR SELECT USING (true);

CREATE POLICY "Enable all for authenticated users" ON public.common_locations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. 验证迁移结果
-- 检查 job_steps 表结构
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'job_steps'
ORDER BY ordinal_position;

-- 检查 common_locations 数据
SELECT * FROM public.common_locations;

-- 完成提示
DO $$ 
BEGIN
  RAISE NOTICE '✅ 迁移完成！';
  RAISE NOTICE '✅ common_locations 表已创建';
  RAISE NOTICE '✅ job_steps 表已更新';
  RAISE NOTICE '✅ 索引已创建';
  RAISE NOTICE '✅ RLS 策略已设置';
END $$;
