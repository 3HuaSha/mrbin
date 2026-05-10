-- 支持换桶订单拆分成送+收两条
-- 核心改动:
-- 1. order_number 不再是唯一键, 改用 (order_number, type) 复合唯一
--    这样 SOT100 原 delivery 记录 + 对应 pickup 记录 可以并存
-- 2. 新增 linked_order_id 字段存储关联订单 (新送单 <-> 旧单的收桶)

-- 1. 删除原来的 order_number 唯一约束
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_number_key;

-- 2. 新增复合唯一约束 (order_number, type)
ALTER TABLE public.orders ADD CONSTRAINT orders_number_type_unique UNIQUE (order_number, type);

-- 3. 新增 linked_order_id 字段
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS linked_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_linked ON public.orders(linked_order_id);

COMMENT ON COLUMN public.orders.linked_order_id IS '换桶订单关联: 新送桶单指向自动生成的旧单收桶记录';
