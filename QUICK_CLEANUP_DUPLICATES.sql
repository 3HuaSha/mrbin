-- 快速清理重复司机账户
-- 这个脚本会立即删除所有带括号后缀的司机账户（如 Jason(2), Dao(1) 等）

-- 步骤 1: 查看将要删除的账户
SELECT 
  id,
  name,
  phone,
  email,
  is_active,
  REGEXP_REPLACE(name, '\s*\(\d+\)\s*$', '', 'g') as normalized_name
FROM profiles
WHERE role = 'driver'
  AND name ~ '\(\d+\)$'
ORDER BY name;

-- 步骤 2: 执行清理（删除所有带括号后缀的司机）
DO $$
DECLARE
  duplicate_record RECORD;
BEGIN
  -- 遍历所有带括号后缀的司机账户
  FOR duplicate_record IN 
    SELECT id, name
    FROM profiles
    WHERE role = 'driver'
      AND name ~ '\(\d+\)$'
  LOOP
    RAISE NOTICE '🗑️ 删除重复账户: % (ID: %)', duplicate_record.name, duplicate_record.id;
    
    -- 删除相关的外键引用
    DELETE FROM driver_vehicle_assignments WHERE driver_id = duplicate_record.id;
    DELETE FROM driver_locations WHERE driver_id = duplicate_record.id;
    
    -- 注意：不删除 job_steps 和 dispatch_assignments 的历史数据
    -- 如果需要保留历史数据，可以将这些记录关联到主账户
    
    -- 删除司机账户
    DELETE FROM profiles WHERE id = duplicate_record.id;
  END LOOP;
  
  RAISE NOTICE '✅ 清理完成！';
END $$;

-- 步骤 3: 验证清理结果
SELECT 
  id,
  name,
  phone,
  email,
  is_active
FROM profiles
WHERE role = 'driver'
ORDER BY name;

-- 步骤 4: 检查是否还有重复名称
SELECT 
  name,
  COUNT(*) as count
FROM profiles
WHERE role = 'driver'
GROUP BY name
HAVING COUNT(*) > 1;
