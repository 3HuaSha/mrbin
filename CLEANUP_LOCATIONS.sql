-- 🧹 自动清理 driver_locations 表，只保留最近1分钟的数据
-- 直接在 Supabase SQL Editor 中运行

-- ========== 第一步：创建清理函数 ==========
CREATE OR REPLACE FUNCTION public.cleanup_old_driver_locations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 删除1分钟前的位置数据
  DELETE FROM public.driver_locations
  WHERE recorded_at < NOW() - INTERVAL '1 minute';
  
  -- 可选：记录清理日志
  RAISE NOTICE 'Cleaned up driver locations older than 1 minute';
END;
$$;

-- ========== 第二步：创建触发器函数 ==========
-- 每次插入新位置时，自动清理该司机的旧数据
CREATE OR REPLACE FUNCTION public.trigger_cleanup_old_locations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 删除该司机1分钟前的旧数据
  DELETE FROM public.driver_locations
  WHERE driver_id = NEW.driver_id
    AND recorded_at < NOW() - INTERVAL '1 minute';
  
  RETURN NEW;
END;
$$;

-- ========== 第三步：创建触发器 ==========
DROP TRIGGER IF EXISTS cleanup_locations_on_insert ON public.driver_locations;

CREATE TRIGGER cleanup_locations_on_insert
AFTER INSERT ON public.driver_locations
FOR EACH ROW
EXECUTE FUNCTION public.trigger_cleanup_old_locations();

-- ========== 第四步：立即清理现有的旧数据 ==========
DELETE FROM public.driver_locations
WHERE recorded_at < NOW() - INTERVAL '1 minute';

-- ========== 第五步：验证配置 ==========
-- 查看当前保留的位置数据
SELECT 
  COUNT(*) as total_records,
  MIN(recorded_at) as oldest_record,
  MAX(recorded_at) as newest_record,
  NOW() - MIN(recorded_at) as oldest_age
FROM public.driver_locations;

-- 应该只看到最近1分钟内的数据

-- ========== 工作原理 ==========
-- 1. 每次司机端上报新位置（每30秒一次）
-- 2. 触发器自动删除该司机1分钟前的旧位置
-- 3. 这样每个司机最多保留2-3条位置记录（最近1分钟内的）
-- 4. 大大减少数据库存储空间

-- ========== 手动清理命令（可选）==========
-- 如果需要手动清理，运行：
-- SELECT public.cleanup_old_driver_locations();
