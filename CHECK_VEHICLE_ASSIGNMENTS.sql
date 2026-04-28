-- 检查车辆分配数据

-- 1. 查看所有车辆
SELECT id, name, samsara_id, type, plate 
FROM vehicles 
ORDER BY name;

-- 2. 查看所有司机
SELECT id, name, email 
FROM profiles 
WHERE role = 'driver' 
ORDER BY name;

-- 3. 查看所有车辆分配
SELECT 
  dva.id,
  p.name as driver_name,
  v.name as vehicle_name,
  v.samsara_id,
  dva.assigned_at
FROM driver_vehicle_assignments dva
JOIN profiles p ON dva.driver_id = p.id
JOIN vehicles v ON dva.vehicle_id = v.id
ORDER BY dva.assigned_at DESC;

-- 4. 检查 samsara_id 是否匹配
-- 这个查询会显示哪些车辆有 samsara_id，哪些没有
SELECT 
  name,
  samsara_id,
  CASE 
    WHEN samsara_id IS NULL THEN '❌ 没有 samsara_id'
    ELSE '✅ 有 samsara_id'
  END as status
FROM vehicles
ORDER BY name;
