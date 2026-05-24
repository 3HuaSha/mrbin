-- Fix: 换桶订单（swap）现在只有 display node 没有 workflow steps，
-- 司机直接完成 display node 时，on_step_completed 触发器的
-- UPDATE job_steps SET status='done' WHERE node_type='order' 会匹配到正在更新的同一行，
-- 导致 BEFORE UPDATE 触发器无限递归 → "stack depth limit exceeded"
-- 修复：在更新 display node 时排除当前行 (AND id <> NEW.id)

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
      -- 同时把该 assignment 下的其他 node_type='order' 显示节点也标记为 done
      -- 注意: 排除当前行 (id <> NEW.id) 防止 BEFORE UPDATE 触发器递归
      UPDATE public.job_steps
        SET status = 'done', completed_at = now()
        WHERE assignment_id = NEW.assignment_id
          AND node_type = 'order'
          AND status <> 'done'
          AND id <> NEW.id;
    ELSE
      UPDATE public.orders SET status = 'in_progress', updated_at = now() WHERE id = asg.order_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
