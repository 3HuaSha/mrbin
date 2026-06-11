CREATE TABLE IF NOT EXISTS public.driver_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  activity_type TEXT NOT NULL,
  note TEXT,
  step_id UUID REFERENCES public.job_steps(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_activity_logs_driver_date
  ON public.driver_activity_logs(driver_id, scheduled_date, created_at);

ALTER TABLE public.driver_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_all" ON public.driver_activity_logs;
CREATE POLICY "open_all" ON public.driver_activity_logs
FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.driver_activity_logs IS 'One-tap driver status/activity events such as lunch, waiting customer, traffic, fuel, or vehicle issue.';
