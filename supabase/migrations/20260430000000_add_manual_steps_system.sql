-- 添加手动步骤系统支持

-- 创建常用地点表
CREATE TABLE IF NOT EXISTS public.common_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  type TEXT, -- 'depot', 'material_yard', 'other'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 插入常用地点
INSERT INTO public.common_locations (name, address, type) VALUES
  ('Kennedy Depot', '3445 Kennedy Rd, Toronto, ON', 'depot'),
  ('Sheppard Yard', '12441 Sheppard Ave, Toronto, ON', 'depot')
ON CONFLICT DO NOTHING;

-- 调整 job_steps 表结构，支持两种节点
-- 1. 添加 driver_id 和 scheduled_date（必填）
ALTER TABLE public.job_steps 
ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- 2. 将 assignment_id 改为可选
ALTER TABLE public.job_steps 
ALTER COLUMN assignment_id DROP NOT NULL;

-- 3. 添加 order_id（可选，订单节点才有）
ALTER TABLE public.job_steps 
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE;

-- 4. 添加节点类型标识
ALTER TABLE public.job_steps 
ADD COLUMN IF NOT EXISTS node_type TEXT CHECK (node_type IN ('order', 'step')) DEFAULT 'step';

-- 5. 添加备注字段
ALTER TABLE public.job_steps 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 6. 添加 bin_id 字段（可选）
ALTER TABLE public.job_steps 
ADD COLUMN IF NOT EXISTS bin_id UUID REFERENCES public.bins(id);

-- 7. 将 location 改为可选（因为原来是 NOT NULL）
ALTER TABLE public.job_steps 
ALTER COLUMN location DROP NOT NULL;

-- 更新现有数据：为已有的 job_steps 填充 driver_id 和 scheduled_date
UPDATE public.job_steps js
SET 
  driver_id = da.driver_id,
  scheduled_date = da.scheduled_date,
  order_id = da.order_id,
  node_type = 'order'
FROM public.dispatch_assignments da
WHERE js.assignment_id = da.id
  AND js.driver_id IS NULL;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_job_steps_driver_date ON public.job_steps(driver_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_job_steps_order ON public.job_steps(order_id);
CREATE INDEX IF NOT EXISTS idx_job_steps_sequence ON public.job_steps(driver_id, scheduled_date, step_number);

-- 添加注释
COMMENT ON TABLE public.job_steps IS '统一的任务步骤表，包含订单节点和手动步骤节点';
COMMENT ON COLUMN public.job_steps.driver_id IS '必填，属于哪个司机';
COMMENT ON COLUMN public.job_steps.scheduled_date IS '必填，哪天执行';
COMMENT ON COLUMN public.job_steps.step_number IS '必填，执行顺序';
COMMENT ON COLUMN public.job_steps.order_id IS '可选，订单节点才有';
COMMENT ON COLUMN public.job_steps.assignment_id IS '可选，订单节点才有';
COMMENT ON COLUMN public.job_steps.node_type IS '节点类型：order(订单节点) 或 step(手动步骤)';
COMMENT ON COLUMN public.job_steps.step_type IS '动作类型：使用现有的step_type枚举';

-- 常用地点表的 RLS
ALTER TABLE public.common_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for all users" ON public.common_locations
  FOR SELECT USING (true);

CREATE POLICY "Enable all for authenticated users" ON public.common_locations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- job_steps 表的 RLS
ALTER TABLE public.job_steps ENABLE ROW LEVEL SECURITY;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Drivers can view their own steps" ON public.job_steps;
DROP POLICY IF EXISTS "Drivers can update their own steps" ON public.job_steps;
DROP POLICY IF EXISTS "Dispatchers and admins can insert steps" ON public.job_steps;
DROP POLICY IF EXISTS "Dispatchers and admins can delete steps" ON public.job_steps;
DROP POLICY IF EXISTS "Staff can insert steps" ON public.job_steps;
DROP POLICY IF EXISTS "Staff can delete steps" ON public.job_steps;

-- 司机可以查看自己的步骤，staff 可以查看所有步骤
CREATE POLICY "Drivers can view their own steps" 
ON public.job_steps
FOR SELECT
TO authenticated
USING (
  driver_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  )
);

-- 司机可以更新自己的步骤，staff 可以更新所有步骤
CREATE POLICY "Drivers can update their own steps" 
ON public.job_steps
FOR UPDATE
TO authenticated
USING (
  driver_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  )
)
WITH CHECK (
  driver_id = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  )
);

-- staff 可以插入步骤
CREATE POLICY "Staff can insert steps" 
ON public.job_steps
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  )
);

-- staff 可以删除步骤
CREATE POLICY "Staff can delete steps" 
ON public.job_steps
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  )
);

