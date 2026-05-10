-- 修复 samsara_drivers 表权限
-- Supabase 默认 anon/authenticated 角色没有表级 GRANT, RLS open_all 策略也无法绕过 PostgreSQL 表权限

GRANT SELECT, INSERT, UPDATE, DELETE ON public.samsara_drivers TO anon, authenticated, service_role;

-- 再次确认 RLS 策略
ALTER TABLE public.samsara_drivers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_all" ON public.samsara_drivers;
CREATE POLICY "open_all" ON public.samsara_drivers FOR ALL USING (true) WITH CHECK (true);
