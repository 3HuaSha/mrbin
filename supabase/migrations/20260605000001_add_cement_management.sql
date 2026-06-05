CREATE TABLE IF NOT EXISTS public.cement_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_date DATE NOT NULL,
  demand_time TEXT,
  order_date DATE,
  order_number TEXT,
  company TEXT NOT NULL DEFAULT '',
  tel TEXT,
  mpa TEXT,
  air TEXT,
  pump_truck BOOLEAN NOT NULL DEFAULT false,
  order_qty_cbm NUMERIC(10, 2),
  note TEXT,
  delivery_address TEXT NOT NULL DEFAULT '',
  driver_name TEXT,
  vehicle_name TEXT,
  schedule_sequence INTEGER,
  arrival_time TEXT,
  finish_time TEXT,
  actual_usage_cbm NUMERIC(10, 2),
  delivered_qty_cbm NUMERIC(10, 2),
  receivable_amount NUMERIC(12, 2),
  driver_collected NUMERIC(12, 2),
  paid_amount NUMERIC(12, 2),
  invoice_number TEXT,
  print_status TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cement_orders_status_check CHECK (
    status IN ('pending', 'scheduled', 'in_progress', 'delivered', 'completed', 'cancelled')
  ),
  CONSTRAINT cement_orders_qty_check CHECK (
    order_qty_cbm IS NULL OR order_qty_cbm >= 0
  ),
  CONSTRAINT cement_orders_delivered_qty_check CHECK (
    delivered_qty_cbm IS NULL OR delivered_qty_cbm >= 0
  ),
  CONSTRAINT cement_orders_actual_usage_check CHECK (
    actual_usage_cbm IS NULL OR actual_usage_cbm >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS cement_orders_order_number_key
  ON public.cement_orders(order_number)
  WHERE order_number IS NOT NULL AND order_number <> '';

CREATE INDEX IF NOT EXISTS idx_cement_orders_demand_date
  ON public.cement_orders(demand_date, status);

CREATE INDEX IF NOT EXISTS idx_cement_orders_company
  ON public.cement_orders(company);

CREATE TABLE IF NOT EXISTS public.cement_material_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_date DATE,
  order_number TEXT,
  company TEXT NOT NULL DEFAULT '',
  contact TEXT,
  tel TEXT,
  material TEXT NOT NULL DEFAULT '',
  order_qty NUMERIC(10, 2),
  order_unit TEXT,
  demand_date DATE NOT NULL,
  demand_time TEXT,
  note TEXT,
  driver_name TEXT,
  delivered_qty NUMERIC(10, 2),
  deliver_unit TEXT,
  delivery_address TEXT NOT NULL DEFAULT '',
  invoice_number TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cement_material_orders_status_check CHECK (
    status IN ('pending', 'ordered', 'scheduled', 'delivered', 'completed', 'cancelled')
  ),
  CONSTRAINT cement_material_orders_qty_check CHECK (
    order_qty IS NULL OR order_qty >= 0
  ),
  CONSTRAINT cement_material_orders_delivered_qty_check CHECK (
    delivered_qty IS NULL OR delivered_qty >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS cement_material_orders_order_number_key
  ON public.cement_material_orders(order_number)
  WHERE order_number IS NOT NULL AND order_number <> '';

CREATE INDEX IF NOT EXISTS idx_cement_material_orders_demand_date
  ON public.cement_material_orders(demand_date, status);

CREATE INDEX IF NOT EXISTS idx_cement_material_orders_company
  ON public.cement_material_orders(company);

CREATE OR REPLACE FUNCTION public.set_cement_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_cement_orders_updated_at ON public.cement_orders;
CREATE TRIGGER set_cement_orders_updated_at
BEFORE UPDATE ON public.cement_orders
FOR EACH ROW EXECUTE FUNCTION public.set_cement_updated_at();

DROP TRIGGER IF EXISTS set_cement_material_orders_updated_at ON public.cement_material_orders;
CREATE TRIGGER set_cement_material_orders_updated_at
BEFORE UPDATE ON public.cement_material_orders
FOR EACH ROW EXECUTE FUNCTION public.set_cement_updated_at();

ALTER TABLE public.cement_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cement_material_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage cement orders" ON public.cement_orders;
CREATE POLICY "staff manage cement orders"
ON public.cement_orders
FOR ALL
TO authenticated
USING (
  public.has_role((select auth.uid()), 'admin')
  OR public.has_role((select auth.uid()), 'dispatcher')
)
WITH CHECK (
  public.has_role((select auth.uid()), 'admin')
  OR public.has_role((select auth.uid()), 'dispatcher')
);

DROP POLICY IF EXISTS "staff manage cement material orders" ON public.cement_material_orders;
CREATE POLICY "staff manage cement material orders"
ON public.cement_material_orders
FOR ALL
TO authenticated
USING (
  public.has_role((select auth.uid()), 'admin')
  OR public.has_role((select auth.uid()), 'dispatcher')
)
WITH CHECK (
  public.has_role((select auth.uid()), 'admin')
  OR public.has_role((select auth.uid()), 'dispatcher')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cement_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cement_material_orders TO authenticated;
