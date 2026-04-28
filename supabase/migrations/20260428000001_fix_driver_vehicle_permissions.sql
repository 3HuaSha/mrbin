-- 修复 driver_vehicle_assignments 表的权限问题

-- 如果表已存在，先删除旧策略
DROP POLICY IF EXISTS "open_all" ON public.driver_vehicle_assignments;

-- 确保 RLS 已启用
ALTER TABLE public.driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;

-- 重新创建开放策略（与其他表保持一致）
CREATE POLICY "open_all" ON public.driver_vehicle_assignments 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- 如果表不存在，创建它
CREATE TABLE IF NOT EXISTS public.driver_vehicle_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  UNIQUE(driver_id, vehicle_id)
);

-- 创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_driver_vehicle_driver ON public.driver_vehicle_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_vehicle_vehicle ON public.driver_vehicle_assignments(vehicle_id);

-- 确保策略存在
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'driver_vehicle_assignments' 
    AND policyname = 'open_all'
  ) THEN
    CREATE POLICY "open_all" ON public.driver_vehicle_assignments 
      FOR ALL 
      USING (true) 
      WITH CHECK (true);
  END IF;
END $$;
