-- 禁用自动创建 job_steps 的触发器
-- 原因：DispatchPage 前端现在负责创建完整的步骤链（包括 dump_site）
-- 这样可以正确设置 driver_id、scheduled_date、node_type、order_id 等新字段
-- 同时支持 dump_site 步骤独立调度（换日期、换司机）

DROP TRIGGER IF EXISTS assignments_create_steps ON public.dispatch_assignments;

-- 保留函数定义（以防需要回滚），只是不再自动触发
COMMENT ON FUNCTION public.create_job_steps_for_assignment() IS 'DEPRECATED: 不再由触发器调用，步骤由前端 DispatchPage 创建';

-- 更新 on_step_completed 触发器：
-- 1. 支持新的 'swap' step_type（前端创建的 swap 步骤用此类型而非 customer_delivery）
-- 2. dump_site 步骤不再阻塞订单完成（dump 是跟进阶段，在时间轴独立显示）
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

    -- 解锁下一步 (只在同类型的工作流步骤中找下一步)
    SELECT id INTO next_step
    FROM public.job_steps
    WHERE assignment_id = NEW.assignment_id
      AND step_number = NEW.step_number + 1
      AND (node_type IS NULL OR node_type <> 'order');
    IF next_step IS NOT NULL THEN
      UPDATE public.job_steps SET status = 'pending' WHERE id = next_step;
    END IF;

    -- 桶状态联动
    bn := NEW.bin_number_reported;
    old_bn := NEW.old_bin_number_reported;

    IF NEW.step_type = 'depot_pickup' AND bn IS NOT NULL THEN
      UPDATE public.bins
        SET status = 'in_transit', current_order_id = asg.order_id, last_moved_at = now()
        WHERE bin_number = bn;

    ELSIF (NEW.step_type = 'customer_delivery' OR NEW.step_type = 'swap') AND bn IS NOT NULL THEN
      UPDATE public.bins
        SET status = 'on_site', current_order_id = asg.order_id, current_address = o.address, last_moved_at = now()
        WHERE bin_number = bn;
      INSERT INTO public.bin_history (bin_id, order_id, event, from_location, to_location)
      SELECT id, asg.order_id, 'delivered', 'Kennedy Depot', o.address FROM public.bins WHERE bin_number = bn;

      -- swap:同时取走旧桶
      IF o.type = 'swap' AND old_bn IS NOT NULL THEN
        UPDATE public.bins
          SET status = 'in_transit', current_address = NULL, last_moved_at = now()
          WHERE bin_number = old_bn;
        INSERT INTO public.bin_history (bin_id, order_id, event, from_location, to_location)
        SELECT id, asg.order_id, 'swapped_out', o.address, 'In transit' FROM public.bins WHERE bin_number = old_bn;
      END IF;

    ELSIF NEW.step_type = 'customer_pickup' AND bn IS NOT NULL THEN
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

    -- 检查订单是否完成: 排除 node_type='order' 显示节点和 dump_site 跟进步骤
    SELECT COUNT(*) INTO remaining
      FROM public.job_steps
      WHERE assignment_id = NEW.assignment_id
        AND status <> 'done'
        AND id <> NEW.id
        AND (node_type IS NULL OR node_type <> 'order')
        AND step_type NOT IN ('dump_site', 'dump_waste');
    IF remaining = 0 THEN
      UPDATE public.orders SET status = 'done', updated_at = now() WHERE id = asg.order_id;
      -- 同时把该 assignment 下的 node_type='order' 显示节点也标记为 done
      UPDATE public.job_steps
        SET status = 'done', completed_at = now()
        WHERE assignment_id = NEW.assignment_id
          AND node_type = 'order'
          AND status <> 'done';
    ELSE
      UPDATE public.orders SET status = 'in_progress', updated_at = now() WHERE id = asg.order_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
