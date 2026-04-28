-- 🔍 诊断 driver_vehicle_assignments 权限问题
-- 在 Supabase SQL Editor 中运行此脚本来诊断问题

-- ========== 1. 检查表是否存在 ==========
SELECT 
  table_schema,
  table_name,
  table_type
FROM information_schema.tables
WHERE table_name = 'driver_vehicle_assignments';
-- 应该返回 1 行，table_type = 'BASE TABLE'

-- ========== 2. 检查表的所有者 ==========
SELECT 
  tablename,
  tableowner
FROM pg_tables
WHERE tablename = 'driver_vehicle_assignments';
-- 应该返回 owner = 'postgres'

-- ========== 3. 检查 RLS 是否启用 ==========
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'driver_vehicle_assignments';
-- rowsecurity 应该是 true

-- ========== 4. 检查所有策略 ==========
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
-- 应该至少有一个 "open_all" 策略

-- ========== 5. 检查角色权限 ==========
SELECT 
  grantee, 
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants 
WHERE table_name = 'driver_vehicle_assignments'
ORDER BY grantee, privilege_type;
-- 应该看到 anon, authenticated, service_role 都有权限

-- ========== 6. 检查当前用户 ==========
SELECT current_user, session_user;
-- 应该返回当前连接的用户

-- ========== 7. 测试查询权限 ==========
-- 尝试查询表（这会显示实际的权限错误）
SELECT COUNT(*) FROM public.driver_vehicle_assignments;
-- 如果这里报错，复制错误信息

-- ========== 8. 比较其他表的配置 ==========
-- 查看 vehicles 表的配置（这个表应该是工作的）
SELECT 
  'vehicles' as table_name,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'vehicles'
UNION ALL
SELECT 
  'driver_vehicle_assignments' as table_name,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'driver_vehicle_assignments';
-- 比较两个表的策略是否一致

-- ========== 诊断完成 ==========
-- 请将上面所有查询的结果截图或复制给我
