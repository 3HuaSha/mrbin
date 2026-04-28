-- 检查其他工作正常的表的策略配置
-- 用来对比和找出差异

-- 查看 vehicles 表的策略（这个表应该是工作的）
SELECT 
  'vehicles' as table_name,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'vehicles';

-- 查看 profiles 表的策略
SELECT 
  'profiles' as table_name,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'profiles';

-- 查看 driver_vehicle_assignments 表的策略
SELECT 
  'driver_vehicle_assignments' as table_name,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'driver_vehicle_assignments';

-- 请运行这个查询，然后把所有三个表的结果发给我
-- 这样我可以看出差异在哪里
