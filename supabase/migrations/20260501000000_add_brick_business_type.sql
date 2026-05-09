-- ============================================================================
-- Migration: Add Brick Business Type Support
-- Description: Adds support for brick delivery business alongside garbage rental
-- Date: 2026-05-01
-- ============================================================================

-- ============================================================================
-- Part 1: Create Enums
-- ============================================================================

-- Create business_type enum
CREATE TYPE public.business_type AS ENUM ('garbage', 'brick');

-- Create brick_order_type enum
CREATE TYPE public.brick_order_type AS ENUM ('pickup_from_factory', 'delivery_to_customer');

-- ============================================================================
-- Part 2: Create New Tables
-- ============================================================================

-- Create brick_factories table
CREATE TABLE public.brick_factories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for brick_factories
ALTER TABLE public.brick_factories ENABLE ROW LEVEL SECURITY;

-- Create policy for brick_factories
CREATE POLICY "open_all" ON public.brick_factories 
  FOR ALL USING (true) WITH CHECK (true);

-- Create index for brick_factories
CREATE INDEX idx_brick_factories_active ON public.brick_factories(is_active);

-- Create company_yards table
CREATE TABLE public.company_yards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  max_capacity INTEGER NOT NULL DEFAULT 1000,
  current_inventory INTEGER NOT NULL DEFAULT 0,
  contact_name TEXT,
  contact_phone TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraints
  CONSTRAINT check_inventory_non_negative CHECK (current_inventory >= 0),
  CONSTRAINT check_inventory_within_capacity CHECK (current_inventory <= max_capacity)
);

-- Enable RLS for company_yards
ALTER TABLE public.company_yards ENABLE ROW LEVEL SECURITY;

-- Create policy for company_yards
CREATE POLICY "open_all" ON public.company_yards 
  FOR ALL USING (true) WITH CHECK (true);

-- Create index for company_yards
CREATE INDEX idx_company_yards_active ON public.company_yards(is_active);

-- Create brick_inventory_history table
CREATE TABLE public.brick_inventory_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yard_id UUID REFERENCES public.company_yards(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL, -- 'order_pickup', 'order_delivery', 'manual_adjustment'
  quantity_change INTEGER NOT NULL, -- positive for increase, negative for decrease
  inventory_before INTEGER NOT NULL,
  inventory_after INTEGER NOT NULL,
  reason TEXT, -- required for manual adjustments
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for brick_inventory_history
ALTER TABLE public.brick_inventory_history ENABLE ROW LEVEL SECURITY;

-- Create policy for brick_inventory_history
CREATE POLICY "open_all" ON public.brick_inventory_history 
  FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for brick_inventory_history
CREATE INDEX idx_brick_inventory_history_yard ON public.brick_inventory_history(yard_id);
CREATE INDEX idx_brick_inventory_history_order ON public.brick_inventory_history(order_id);
CREATE INDEX idx_brick_inventory_history_created_at ON public.brick_inventory_history(created_at DESC);

-- ============================================================================
-- Part 3: Modify orders table
-- ============================================================================

-- Add new columns to orders table
ALTER TABLE public.orders 
  ADD COLUMN business_type public.business_type NOT NULL DEFAULT 'garbage',
  ADD COLUMN brick_order_type public.brick_order_type,
  ADD COLUMN origin_factory_id UUID REFERENCES public.brick_factories(id),
  ADD COLUMN origin_yard_id UUID REFERENCES public.company_yards(id),
  ADD COLUMN destination_yard_id UUID REFERENCES public.company_yards(id);

-- Add constraints
ALTER TABLE public.orders 
  ADD CONSTRAINT check_brick_order_type 
  CHECK (
    (business_type = 'brick' AND brick_order_type IS NOT NULL) OR
    (business_type = 'garbage' AND brick_order_type IS NULL)
  );

ALTER TABLE public.orders 
  ADD CONSTRAINT check_pickup_from_factory 
  CHECK (
    (brick_order_type = 'pickup_from_factory' AND origin_factory_id IS NOT NULL AND destination_yard_id IS NOT NULL) OR
    (brick_order_type != 'pickup_from_factory' OR brick_order_type IS NULL)
  );

ALTER TABLE public.orders 
  ADD CONSTRAINT check_delivery_to_customer 
  CHECK (
    (brick_order_type = 'delivery_to_customer' AND origin_yard_id IS NOT NULL) OR
    (brick_order_type != 'delivery_to_customer' OR brick_order_type IS NULL)
  );

-- Create indexes for orders
CREATE INDEX idx_orders_business_type ON public.orders(business_type);
CREATE INDEX idx_orders_brick_order_type ON public.orders(brick_order_type);

-- ============================================================================
-- Part 4: Data Migration
-- ============================================================================

-- Set business_type to 'garbage' for all existing orders (already default, but explicit)
UPDATE public.orders SET business_type = 'garbage' WHERE business_type IS NULL;

-- ============================================================================
-- Part 5: Insert Sample Data (Optional - for testing)
-- ============================================================================

-- Insert sample brick factories
INSERT INTO public.brick_factories (name, address, latitude, longitude, is_active)
VALUES 
  ('砖厂A', '123 Factory St, Toronto, ON', 43.6532, -79.3832, true),
  ('砖厂B', '456 Brick Ave, Toronto, ON', 43.6612, -79.3952, true);

-- Insert sample company yards
INSERT INTO public.company_yards (name, address, latitude, longitude, max_capacity, current_inventory, is_active)
VALUES 
  ('场地1', '111 Yard St, Toronto, ON', 43.6632, -79.3732, 1000, 500, true),
  ('场地2', '222 Storage Ave, Toronto, ON', 43.6732, -79.3632, 800, 0, true);

-- ============================================================================
-- Part 6: Update Triggers (if needed)
-- ============================================================================

-- Note: Trigger updates will be handled in a separate migration if needed
-- This includes:
-- - Updating create_job_steps_for_assignment() to handle brick orders
-- - Updating on_step_completed() to update inventory

COMMENT ON TABLE public.brick_factories IS 'Stores brick factory locations for brick delivery business';
COMMENT ON TABLE public.company_yards IS 'Stores company yard locations with brick inventory tracking';
COMMENT ON TABLE public.brick_inventory_history IS 'Tracks all brick inventory changes at company yards';
COMMENT ON COLUMN public.orders.business_type IS 'Type of business: garbage rental or brick delivery';
COMMENT ON COLUMN public.orders.brick_order_type IS 'Type of brick order: pickup from factory or delivery to customer';
