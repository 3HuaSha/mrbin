-- 路线时间缓存表
-- 存储两点之间的行驶时间和距离, 避免重复调用 Google Routes API
CREATE TABLE IF NOT EXISTS public.route_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_address TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL, -- 行驶时间(秒)
  distance_meters INTEGER NOT NULL,  -- 距离(米)
  cached_at TIMESTAMPTZ DEFAULT now(),
  -- 同一对起终点只存一条
  UNIQUE(origin_address, destination_address)
);

-- 索引: 按起终点快速查找
CREATE INDEX IF NOT EXISTS idx_route_cache_lookup 
  ON public.route_cache(origin_address, destination_address);

-- RLS
ALTER TABLE public.route_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all" ON public.route_cache FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.route_cache IS '路线时间缓存: 存储两点间行驶时间, 避免重复调用 Google Routes API';
