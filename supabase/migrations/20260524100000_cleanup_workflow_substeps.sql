-- 清理旧的 workflow 子步骤 (node_type IS NULL)
-- 这些步骤会导致司机端显示多余的任务（如"送到客户"、"仓库取桶"等）
-- 现在只保留 node_type='order' (订单显示节点) 和 node_type='step' (手动步骤)

-- 1. 删除所有 workflow 子步骤 (node_type IS NULL 的记录)
DELETE FROM public.job_steps WHERE node_type IS NULL;

-- 2. 修改 on_step_completed 触发器:
--    当 order 节点标记为 done 时，直接标记订单为完成
--    不再依赖 workflow 子步骤来判断订单是否完成
CREATE OR REPLACE FUNCTION public.on_step_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  asg public.dispatch_assignments%ROWTYPE;
  o public.orders%ROWTYPE;
  next_step UUID;
  remaining INT;
  bn TEXT;
  old_bn TEXT;
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    NEW.completed_at := now();
    SELECT * INTO asg FROM public.dispatch_assignments WHERE id = NEW.assignment_id;
    IF asg.id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT * INTO o FROM public.orders WHERE id = asg.order_id;

    -- 桶状态联动 (基于 step_type)
    bn := NEW.bin_number_reported;
    old_bn := NEW.old_bin_number_reported;

    IF NEW.step_type = 'depot_pickup' AND bn IS NOT NULL THEN
      UPDATE public.bins
        SET status = 'in_transit', current_order_id = asg.order_id, last_moved_at = now()
        WHERE bin_number = bn;

    ELSIF NEW.step_type IN ('customer_delivery', 'swap', 'delivery') AND bn IS NOT NULL THEN
      UPDATE public.bins
        SET status = 'on_site', current_order_id = asg.order_id, current_address = o.address, last_moved_at = now()
        WHERE bin_number = bn;
      INSERT INTO public.bin_history (bin_id, order_id, event, from_location, to_location)
      SELECT id, asg.order_id, 'delivered', 'Kennedy Depot', o.address FROM public.bins WHERE bin_number = bn;

      -- swap: 同时取走旧桶
      IF o.type = 'swap' AND old_bn IS NOT NULL THEN
        UPDATE public.bins
          SET status = 'in_transit', current_address = NULL, last_moved_at = now()
          WHERE bin_number = old_bn;
        INSERT INTO public.bin_history (bin_id, order_id, event, from_location, to_location)
        SELECT id, asg.order_id, 'swapped_out', o.address, 'In transit' FROM public.bins WHERE bin_number = old_bn;
      END IF;

    ELSIF NEW.step_type IN ('customer_pickup', 'pickup') AND bn IS NOT NULL THEN
      UPDATE public.bins
        SET status = 'in_transit', current_address = NULL, last_moved_at = now()
        WHERE bin_number = bn;
      INSERT INTO public.bin_history (bin_id, order_id, event, from_location, to_location)
      SELECT id, asg.order_id, 'picked_up', o.address, 'In transit' FROM public.bins WHERE bin_number = bn;

    ELSIF NEW.step_type IN ('dump_site', 'dump_waste') THEN
      UPDATE public.bins b
        SET status = 'depot', current_order_id = NULL, current_address = NULL, last_moved_at = now()
        WHERE b.current_order_id = asg.order_id AND b.status = 'in_transit';
    END IF;

    -- 如果是 order 节点被完成，标记订单完成
    -- 但砂石料的 load_material 完成不算，要等 unload_material 完成才算
    IF NEW.node_type = 'order' AND NEW.step_type NOT IN ('load_material') THEN
      UPDATE public.orders SET status = 'done', updated_at = now() WHERE id = asg.order_id AND status <> 'done';
    ELSIF NEW.node_type = 'order' AND NEW.step_type = 'load_material' THEN
      -- 装料完成，不标记订单 done，但可以解锁下一步
      NULL;
    ELSE
      -- 对于手动步骤 (node_type='step')，检查是否所有 order 节点都完成
      -- 不影响订单状态
      NULL;
    END IF;

    -- 解锁同一司机同一天的下一个步骤 (按 step_number 顺序)
    SELECT id INTO next_step
    FROM public.job_steps
    WHERE driver_id = NEW.driver_id
      AND scheduled_date = NEW.scheduled_date
      AND step_number = NEW.step_number + 1
      AND node_type IS NOT NULL
      AND status <> 'done';
    IF next_step IS NOT NULL THEN
      UPDATE public.job_steps SET status = 'pending' WHERE id = next_step AND status = 'locked';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
