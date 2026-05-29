CREATE TABLE IF NOT EXISTS public.driver_eta_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL REFERENCES public.job_steps(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  step_number INTEGER NOT NULL,
  eta_at TIMESTAMPTZ NOT NULL,
  eta_min_at TIMESTAMPTZ,
  eta_max_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  distance_meters INTEGER,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'OK',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(step_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_eta_snapshots_driver_date
  ON public.driver_eta_snapshots(driver_id, scheduled_date, step_number);

CREATE INDEX IF NOT EXISTS idx_driver_eta_snapshots_order
  ON public.driver_eta_snapshots(order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.driver_eta_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatchers_manage_eta_snapshots"
ON public.driver_eta_snapshots
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

CREATE POLICY "drivers_read_own_eta_snapshots"
ON public.driver_eta_snapshots
FOR SELECT
TO authenticated
USING (
  public.has_role((select auth.uid()), 'admin')
  OR public.has_role((select auth.uid()), 'dispatcher')
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = driver_eta_snapshots.driver_id
      AND p.auth_user_id = (select auth.uid())
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_eta_snapshots TO authenticated;
