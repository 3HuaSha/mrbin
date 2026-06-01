CREATE TABLE IF NOT EXISTS public.driver_slow_segment_notes (
  segment_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  reason_category TEXT,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_slow_segment_notes_date
  ON public.driver_slow_segment_notes(scheduled_date);

CREATE INDEX IF NOT EXISTS idx_driver_slow_segment_notes_driver_date
  ON public.driver_slow_segment_notes(driver_id, scheduled_date);

ALTER TABLE public.driver_slow_segment_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can read slow segment notes" ON public.driver_slow_segment_notes;
CREATE POLICY "authenticated can read slow segment notes"
ON public.driver_slow_segment_notes
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "authenticated can insert slow segment notes" ON public.driver_slow_segment_notes;
CREATE POLICY "authenticated can insert slow segment notes"
ON public.driver_slow_segment_notes
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated can update slow segment notes" ON public.driver_slow_segment_notes;
CREATE POLICY "authenticated can update slow segment notes"
ON public.driver_slow_segment_notes
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.driver_slow_segment_notes TO authenticated;
