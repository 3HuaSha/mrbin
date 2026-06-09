ALTER TABLE public.job_steps
  ADD COLUMN IF NOT EXISTS ticket_number TEXT,
  ADD COLUMN IF NOT EXISTS ticket_type TEXT,
  ADD COLUMN IF NOT EXISTS ocr_raw_text TEXT,
  ADD COLUMN IF NOT EXISTS ocr_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS ocr_checked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.job_steps.ticket_number IS 'OCR extracted dump ticket number, for example LR93955, 004761, NU167755, TDW4618617.';
COMMENT ON COLUMN public.job_steps.ticket_type IS 'OCR ticket type/vendor: LR, MRBIN, YORK1, DRAGLAM, or UNKNOWN.';
COMMENT ON COLUMN public.job_steps.ocr_raw_text IS 'Raw OCR text returned by Google Cloud Vision for manual review.';
COMMENT ON COLUMN public.job_steps.ocr_confidence IS 'Approximate extraction confidence from 0 to 1.';
COMMENT ON COLUMN public.job_steps.ocr_checked IS 'Whether staff has manually checked the OCR result.';
