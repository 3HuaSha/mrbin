-- 清理重复司机账户脚本
-- 此脚本会将 Dao(1), Dao(2) 等重复账户合并到主账户 Dao

-- 步骤 1: 查看所有可能的重复司机（带括号后缀的）
SELECT 
  id,
  name,
  phone,
  email,
  is_active,
  created_at,
  -- 提取规范化名称（移除括号后缀）
  REGEXP_REPLACE(name, '\s*\(\d+\)\s*$', '', 'g') as normalized_name
FROM profiles
WHERE role = 'driver'
  AND name ~ '\(\d+\)$'  -- 匹配以 (数字) 结尾的名称
ORDER BY normalized_name, name;

-- 步骤 2: 对于每个重复账户，找到对应的主账户
-- 示例：将 Dao(1) 和 Dao(2) 的车辆分配转移到 Dao

-- 首先，查看 Dao 相关的所有账户
SELECT 
  id,
  name,
  phone,
  email,
  is_active
FROM profiles
WHERE role = 'driver'
  AND (name = 'Dao' OR name LIKE 'Dao(%)')
ORDER BY name;

-- 步骤 3: 手动合并示例（请根据实际情况修改）
-- 假设：
-- - 主账户 Dao 的 ID 是: <main_dao_id>
-- - 重复账户 Dao(1) 的 ID 是: <dao1_id>
-- - 重复账户 Dao(2) 的 ID 是: <dao2_id>

-- 3.1 将 Dao(1) 的车辆分配转移到 Dao
-- UPDATE driver_vehicle_assignments
-- SET driver_id = '<main_dao_id>'
-- WHERE driver_id = '<dao1_id>';

-- 3.2 将 Dao(2) 的车辆分配转移到 Dao
-- UPDATE driver_vehicle_assignments
-- SET driver_id = '<main_dao_id>'
-- WHERE driver_id = '<dao2_id>';

-- 3.3 将 Dao(1) 的调度分配转移到 Dao
-- UPDATE dispatch_assignments
-- SET driver_id = '<main_dao_id>'
-- WHERE driver_id = '<dao1_id>';

-- 3.4 将 Dao(2) 的调度分配转移到 Dao
-- UPDATE dispatch_assignments
-- SET driver_id = '<main_dao_id>'
-- WHERE driver_id = '<dao2_id>';

-- 3.5 将 Dao(1) 的作业步骤转移到 Dao
-- UPDATE job_steps
-- SET driver_id = '<main_dao_id>'
-- WHERE driver_id = '<dao1_id>';

-- 3.6 将 Dao(2) 的作业步骤转移到 Dao
-- UPDATE job_steps
-- SET driver_id = '<main_dao_id>'
-- WHERE driver_id = '<dao2_id>';

-- 3.7 将 Dao(1) 的位置记录转移到 Dao
-- UPDATE driver_locations
-- SET driver_id = '<main_dao_id>'
-- WHERE driver_id = '<dao1_id>';

-- 3.8 将 Dao(2) 的位置记录转移到 Dao
-- UPDATE driver_locations
-- SET driver_id = '<main_dao_id>'
-- WHERE driver_id = '<dao2_id>';

-- 3.9 删除重复账户
-- DELETE FROM profiles WHERE id = '<dao1_id>';
-- DELETE FROM profiles WHERE id = '<dao2_id>';

-- 步骤 4: 自动化批量合并脚本（高级用户使用）
-- 此脚本会自动处理所有重复账户

DO $$
DECLARE
  duplicate_record RECORD;
  main_account_id UUID;
  normalized TEXT;
BEGIN
  -- 遍历所有带括号后缀的司机账户
  FOR duplicate_record IN 
    SELECT 
      id,
      name,
      REGEXP_REPLACE(name, '\s*\(\d+\)\s*$', '', 'g') as normalized_name
    FROM profiles
    WHERE role = 'driver'
      AND name ~ '\(\d+\)$'
    ORDER BY name
  LOOP
    normalized := duplicate_record.normalized_name;
    
    -- 查找或创建主账户
    SELECT id INTO main_account_id
    FROM profiles
    WHERE role = 'driver'
      AND name = normalized
    LIMIT 1;
    
    IF main_account_id IS NULL THEN
      -- 如果主账户不存在，将当前重复账户重命名为主账户
      RAISE NOTICE '将 % 重命名为主账户 %', duplicate_record.name, normalized;
      UPDATE profiles
      SET name = normalized
      WHERE id = duplicate_record.id;
      
      main_account_id := duplicate_record.id;
    ELSE
      -- 主账户存在，合并数据
      RAISE NOTICE '合并 % 到主账户 % (ID: %)', duplicate_record.name, normalized, main_account_id;
      
      -- 转移车辆分配
      UPDATE driver_vehicle_assignments
      SET driver_id = main_account_id
      WHERE driver_id = duplicate_record.id;
      
      -- 转移调度分配
      UPDATE dispatch_assignments
      SET driver_id = main_account_id
      WHERE driver_id = duplicate_record.id;
      
      -- 转移作业步骤
      UPDATE job_steps
      SET driver_id = main_account_id
      WHERE driver_id = duplicate_record.id;
      
      -- 转移司机位置记录
      UPDATE driver_locations
      SET driver_id = main_account_id
      WHERE driver_id = duplicate_record.id;
      
      -- 转移库存日志（如果有 created_by 字段）
      UPDATE bin_inventory_logs
      SET created_by = main_account_id
      WHERE created_by = duplicate_record.id;
      
      -- 删除重复账户
      DELETE FROM profiles WHERE id = duplicate_record.id;
      
      RAISE NOTICE '已删除重复账户 % (ID: %)', duplicate_record.name, duplicate_record.id;
    END IF;
  END LOOP;
  
  RAISE NOTICE '重复账户合并完成！';
END $$;

-- 步骤 5: 验证清理结果
SELECT 
  name,
  COUNT(*) as count
FROM profiles
WHERE role = 'driver'
GROUP BY name
HAVING COUNT(*) > 1;

-- 如果上面的查询返回空结果，说明没有重复账户了

-- 步骤 6: 查看所有司机账户
SELECT 
  id,
  name,
  phone,
  email,
  is_active,
  created_at
FROM profiles
WHERE role = 'driver'
ORDER BY name;
