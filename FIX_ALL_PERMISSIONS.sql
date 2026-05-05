-- 🔧 修复所有表的权限问题
-- 在 Supabase SQL Editor 中运行此脚本

-- ========== 修复 user_roles 表权限 ==========
-- 启用 RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 删除旧策略
DROP POLICY IF EXISTS "open_all" ON public.user_roles;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable update for all users" ON public.user_roles;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.user_roles;

-- 创建开放策略
CREATE POLICY "open_all" ON public.user_roles FOR ALL USING (true) WITH CHECK (true);

-- 授予权限
GRANT ALL ON public.user_roles TO anon;
GRANT ALL ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- ========== 修复 profiles 表权限 ==========
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_all" ON public.profiles;
CREATE POLICY "open_all" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.profiles TO anon;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- ========== 修复 orders 表权限 ==========
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_all" ON public.orders;
CREATE POLICY "open_all" ON public.orders FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.orders TO anon;
GRANT ALL ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

-- ========== 修复 vehicles 表权限 ==========
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_all" ON public.vehicles;
CREATE POLICY "open_all" ON public.vehicles FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.vehicles TO anon;
GRANT ALL ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;

-- ========== 修复 bins 表权限 ==========
ALTER TABLE public.bins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_all" ON public.bins;
CREATE POLICY "open_all" ON public.bins FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.bins TO anon;
GRANT ALL ON public.bins TO authenticated;
GRANT ALL ON public.bins TO service_role;

-- ========== 修复 driver_locations 表权限 ==========
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_all" ON public.driver_locations;
CREATE POLICY "open_all" ON public.driver_locations FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.driver_locations TO anon;
GRANT ALL ON public.driver_locations TO authenticated;
GRANT ALL ON public.driver_locations TO service_role;

-- ========== 修复 driver_vehicle_assignments 表权限 ==========
ALTER TABLE public.driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_all" ON public.driver_vehicle_assignments;
CREATE POLICY "open_all" ON public.driver_vehicle_assignments FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.driver_vehicle_assignments TO anon;
GRANT ALL ON public.driver_vehicle_assignments TO authenticated;
GRANT ALL ON public.driver_vehicle_assignments TO service_role;

-- ========== 修复 job_steps 表权限 ==========
ALTER TABLE public.job_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_all" ON public.job_steps;
CREATE POLICY "open_all" ON public.job_steps FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.job_steps TO anon;
GRANT ALL ON public.job_steps TO authenticated;
GRANT ALL ON public.job_steps TO service_role;

-- ========== 修复 audit_logs 表权限 ==========
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_all" ON public.audit_logs;
CREATE POLICY "open_all" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.audit_logs TO anon;
GRANT ALL ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- ========== 授予所有序列权限 ==========
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ========== 验证配置 ==========
-- 查看所有表的 RLS 策略
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ========== 完成 ==========
-- 如果上面的查询返回了所有表的 "open_all" 策略，说明配置成功！
-- 现在刷新你的应用页面试试
