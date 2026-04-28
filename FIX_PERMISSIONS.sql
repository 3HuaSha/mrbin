-- 🔧 快速修复 driver_vehicle_assignments 权限问题
-- 直接在 Supabase SQL Editor 中运行此脚本

-- ========== 第一步：清理旧数据 ==========
-- 删除所有相关策略
DROP POLICY IF EXISTS "open_all" ON public.driver_vehicle_assignments;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.driver_vehicle_assignments;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.driver_vehicle_assignments;
DROP POLICY IF EXISTS "Enable update for all users" ON public.driver_vehicle_assignments;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.driver_vehicle_assignments;

-- 删除表（如果存在）
DROP TABLE IF EXISTS public.driver_vehicle_assignments CASCADE;

-- ========== 第二步：重新创建表 ==========
CREATE TABLE public.driver_vehicle_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  UNIQUE(driver_id, vehicle_id)
);

-- ========== 第三步：创建索引 ==========
CREATE INDEX idx_driver_vehicle_driver ON public.driver_vehicle_assignments(driver_id);
CREATE INDEX idx_driver_vehicle_vehicle ON public.driver_vehicle_assignments(vehicle_id);

-- ========== 第四步：配置 RLS ==========
-- 启用 RLS
ALTER TABLE public.driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;

-- 创建开放策略（与项目中其他表完全一致的格式）
CREATE POLICY "open_all" ON public.driver_vehicle_assignments FOR ALL USING (true) WITH CHECK (true);

-- ========== 第五步：授予权限 ==========
-- 确保 anon 和 authenticated 角色有完整权限
GRANT ALL ON public.driver_vehicle_assignments TO anon;
GRANT ALL ON public.driver_vehicle_assignments TO authenticated;
GRANT ALL ON public.driver_vehicle_assignments TO service_role;

-- 授予序列权限（如果需要）
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ========== 第六步：验证配置 ==========
-- 查看表权限
SELECT 
  grantee, 
  privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'driver_vehicle_assignments';

-- 查看 RLS 策略
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

-- ========== 完成 ==========
-- 如果上面两个查询都返回了结果，说明配置成功！
-- 现在刷新你的应用页面试试
