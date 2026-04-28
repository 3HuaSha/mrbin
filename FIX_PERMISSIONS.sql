-- 🔧 快速修复 driver_vehicle_assignments 权限问题
-- 直接在 Supabase SQL Editor 中运行此脚本

-- 1. 删除表（如果存在问题）
DROP TABLE IF EXISTS public.driver_vehicle_assignments CASCADE;

-- 2. 重新创建表
CREATE TABLE public.driver_vehicle_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  UNIQUE(driver_id, vehicle_id)
);

-- 3. 创建索引
CREATE INDEX idx_driver_vehicle_driver ON public.driver_vehicle_assignments(driver_id);
CREATE INDEX idx_driver_vehicle_vehicle ON public.driver_vehicle_assignments(vehicle_id);

-- 4. 启用 RLS
ALTER TABLE public.driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;

-- 5. 创建开放策略（与项目中其他表保持一致）
CREATE POLICY "open_all" ON public.driver_vehicle_assignments 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- 6. 验证策略
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'driver_vehicle_assignments';

-- 如果看到一行 "open_all" 策略，说明成功了！
