-- Samsara 司机账号表
-- 每条记录对应 Samsara 平台上的一个司机账号 (可能同一真人有多个: Dao(1) / Dao(2))
-- driver_id 绑定到本地 profiles 表, null 表示未绑定

CREATE TABLE IF NOT EXISTS public.samsara_drivers (
  id TEXT PRIMARY KEY,                                    -- Samsara 原始 ID
  name TEXT NOT NULL,                                      -- Samsara 原始名字 (保留括号后缀)
  phone TEXT,
  driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,  -- 绑定的本地司机
  last_seen_at TIMESTAMPTZ,                                -- 最近一次从 Samsara 同步时看到
  is_active_in_samsara BOOLEAN DEFAULT true,               -- Samsara 后台是否启用
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_samsara_drivers_driver_id ON public.samsara_drivers(driver_id);

ALTER TABLE public.samsara_drivers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_all" ON public.samsara_drivers;
CREATE POLICY "open_all" ON public.samsara_drivers FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.samsara_drivers IS 'Samsara 平台上的司机账号, 通过 driver_id 绑定到本地 profiles';
COMMENT ON COLUMN public.samsara_drivers.driver_id IS 'NULL 表示未绑定本地司机';

-- 清理旧数据: 删除所有从 Samsara 同步过来的司机 (通过名字带括号判断)
-- 注意: 手动创建的司机 (名字不带括号后缀) 会保留
DO $$
DECLARE
  synced_driver RECORD;
BEGIN
  FOR synced_driver IN
    SELECT id FROM public.profiles
    WHERE role = 'driver' AND name ~ '\(\d+\)$'
  LOOP
    DELETE FROM public.driver_vehicle_assignments WHERE driver_id = synced_driver.id;
    DELETE FROM public.driver_locations WHERE driver_id = synced_driver.id;
    DELETE FROM public.profiles WHERE id = synced_driver.id;
  END LOOP;
END $$;
