ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS driver_language TEXT NOT NULL DEFAULT 'zh'
CHECK (driver_language IN ('zh', 'en'));

COMMENT ON COLUMN public.profiles.driver_language IS 'Driver app display language. zh = Chinese, en = English.';
