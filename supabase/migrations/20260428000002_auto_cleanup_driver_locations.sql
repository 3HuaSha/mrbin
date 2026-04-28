-- 自动清理 driver_locations 表，只保留最近1分钟的数据

-- 创建清理函数
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
END;
$$;

-- 创建定时任务（使用 pg_cron 扩展）
-- 注意：需要在 Supabase Dashboard 中启用 pg_cron 扩展

-- 如果 pg_cron 扩展可用，每30秒执行一次清理
-- SELECT cron.schedule(
--   'cleanup-driver-locations',
--   '*/30 * * * * *',  -- 每30秒
--   'SELECT public.cleanup_old_driver_locations();'
-- );

-- 由于 Supabase 可能不支持秒级 cron，我们使用触发器方案
-- 每次插入新数据时，自动清理旧数据

CREATE OR REPLACE FUNCTION public.trigger_cleanup_old_locations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 每次插入新位置时，删除该司机1分钟前的旧数据
  DELETE FROM public.driver_locations
  WHERE driver_id = NEW.driver_id
    AND recorded_at < NOW() - INTERVAL '1 minute';
  
  RETURN NEW;
END;
$$;

-- 创建触发器
DROP TRIGGER IF EXISTS cleanup_locations_on_insert ON public.driver_locations;
CREATE TRIGGER cleanup_locations_on_insert
AFTER INSERT ON public.driver_locations
FOR EACH ROW
EXECUTE FUNCTION public.trigger_cleanup_old_locations();

-- 立即清理一次现有的旧数据
DELETE FROM public.driver_locations
WHERE recorded_at < NOW() - INTERVAL '1 minute';

COMMENT ON FUNCTION public.cleanup_old_driver_locations() IS '清理1分钟前的司机位置数据';
COMMENT ON FUNCTION public.trigger_cleanup_old_locations() IS '插入新位置时自动清理该司机的旧位置数据';
