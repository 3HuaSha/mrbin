-- 🔧 修复 driver_vehicle_assignments 权限问题 V2
-- 问题：策略的 roles 是 {public} 而不是具体角色
-- 解决：删除旧策略，创建针对具体角色的策略

-- ========== 第一步：删除旧策略 ==========
DROP POLICY IF EXISTS "open_all" ON public.driver_vehicle_assignments;

-- ========== 第二步：创建新策略（针对所有角色）==========
-- 为 anon 角色创建策略
CREATE POLICY "Enable all for anon" 
ON public.driver_vehicle_assignments 
FOR ALL 
TO anon
USING (true) 
WITH CHECK (true);

-- 为 authenticated 角色创建策略
CREATE POLICY "Enable all for authenticated" 
ON public.driver_vehicle_assignments 
FOR ALL 
TO authenticated
USING (true) 
WITH CHECK (true);

-- 为 service_role 角色创建策略
CREATE POLICY "Enable all for service_role" 
ON public.driver_vehicle_assignments 
FOR ALL 
TO service_role
USING (true) 
WITH CHECK (true);

-- ========== 第三步：验证新策略 ==========
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'driver_vehicle_assignments'
ORDER BY policyname;

-- 应该看到 3 个策略，每个针对不同的角色

-- ========== 第四步：测试查询 ==========
SELECT COUNT(*) FROM public.driver_vehicle_assignments;

-- 如果这个查询成功，说明权限问题已解决！
