-- Brick dispatch optimization inputs.
-- These fields make pallet capacity, split rules, and priority explicit so
-- route assistance and OR-Tools can use structured data instead of note text.

ALTER TYPE public.brick_order_type ADD VALUE IF NOT EXISTS 'factory_to_customer';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pallet_count INTEGER,
  ADD COLUMN IF NOT EXISTS can_split BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'P3';

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS max_pallets INTEGER NOT NULL DEFAULT 28;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS check_orders_pallet_count_positive;

ALTER TABLE public.orders
  ADD CONSTRAINT check_orders_pallet_count_positive
  CHECK (pallet_count IS NULL OR pallet_count > 0);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS check_orders_priority_value;

ALTER TABLE public.orders
  ADD CONSTRAINT check_orders_priority_value
  CHECK (priority IN ('P1', 'P2', 'P3', 'P4'));

ALTER TABLE public.vehicles
  DROP CONSTRAINT IF EXISTS check_vehicles_max_pallets_positive;

ALTER TABLE public.vehicles
  ADD CONSTRAINT check_vehicles_max_pallets_positive
  CHECK (max_pallets > 0);

COMMENT ON COLUMN public.orders.pallet_count IS 'Number of pallets/boards for brick or material delivery planning.';
COMMENT ON COLUMN public.orders.can_split IS 'Whether this order can be split across trips or vehicles.';
COMMENT ON COLUMN public.orders.priority IS 'Dispatch urgency: P1 hard/urgent through P4 flexible.';
COMMENT ON COLUMN public.vehicles.max_pallets IS 'Maximum pallet capacity for flatbed brick dispatch. Defaults to 28.';
