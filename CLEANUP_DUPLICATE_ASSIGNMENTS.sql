-- 🧹 清理重复的司机车辆分配
-- 问题：一个司机被分配了多辆车
-- 解决：保留每个司机最新的分配，删除旧的分配

-- ========== 第一步：查看重复分配 ==========
-- 运行这个查询查看哪些司机有多个车辆分配
SELECT 
  p.name as driver_name,
  COUNT(*) as vehicle_count,
  STRING_AGG(v.name, ', ') as vehicles
FROM driver_vehicle_assignments dva
JOIN profiles p ON dva.driver_id = p.id
JOIN vehicles v ON dva.vehicle_id = v.id
GROUP BY p.name, dva.driver_id
HAVING COUNT(*) > 1
ORDER BY vehicle_count DESC;

-- ========== 第二步：删除重复分配（保留最新的）==========
-- 这个查询会删除每个司机的旧分配，只保留最新的一个
DELETE FROM driver_vehicle_assignments
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY driver_id 
        ORDER BY assigned_at DESC, id DESC
      ) as rn
    FROM driver_vehicle_assignments
  ) t
  WHERE rn > 1
);

-- ========== 第三步：验证清理结果 ==========
-- 运行这个查询确认每个司机只有一个车辆分配
SELECT 
  p.name as driver_name,
  v.name as vehicle_name,
  dva.assigned_at
FROM driver_vehicle_assignments dva
JOIN profiles p ON dva.driver_id = p.id
JOIN vehicles v ON dva.vehicle_id = v.id
ORDER BY p.name;

-- ========== 完成 ==========
-- 现在每个司机应该只有一个车辆分配了
-- 前端代码已修复，以后更换车辆时会自动删除旧分配
