-- 当司机上报桶号时，自动同步到 orders 表的 bin_number 字段
CREATE OR REPLACE FUNCTION public.sync_bin_number_to_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  asg public.dispatch_assignments%ROWTYPE;
BEGIN
  -- 如果桶号有变化并且不为空
  IF NEW.bin_number_reported IS NOT NULL AND (OLD.bin_number_reported IS NULL OR NEW.bin_number_reported <> OLD.bin_number_reported) THEN
    -- 找到对应的 order_id
    SELECT * INTO asg FROM public.dispatch_assignments WHERE id = NEW.assignment_id;
    IF asg.order_id IS NOT NULL THEN
      -- 更新 orders 表
      UPDATE public.orders 
      SET bin_number = NEW.bin_number_reported 
      WHERE id = asg.order_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_bin_number ON public.job_steps;
CREATE TRIGGER sync_bin_number
AFTER UPDATE OF bin_number_reported ON public.job_steps
FOR EACH ROW EXECUTE FUNCTION public.sync_bin_number_to_order();
