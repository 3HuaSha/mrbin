-- ========== 角色系统 ==========
CREATE TYPE public.app_role AS ENUM ('admin', 'dispatcher', 'driver');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 首版策略:登录用户都可读;只有 admin 可改
CREATE POLICY "any_auth_can_read" ON public.user_roles
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin_manage_roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ========== 司机位置 ==========
CREATE TABLE public.driver_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id),
  lat NUMERIC(10, 7) NOT NULL,
  lng NUMERIC(10, 7) NOT NULL,
  speed_kmh NUMERIC(6, 2),
  heading NUMERIC(5, 2),
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_driver_loc_driver_time ON public.driver_locations(driver_id, recorded_at DESC);

ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all" ON public.driver_locations FOR ALL USING (true) WITH CHECK (true);

-- ========== 审计日志 ==========
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_name TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT,
  details JSONB,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_recorded ON public.audit_logs(recorded_at DESC);
CREATE INDEX idx_audit_entity ON public.audit_logs(entity_type, entity_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_all" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

-- ========== 司机档案绑定 auth 账号 ==========
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user ON public.profiles(auth_user_id);

-- ========== 自动写入登录司机的 auth_user_id ==========
-- 当一个司机用某个邮箱登录时,如果 profile 里 email 匹配且 auth_user_id 为空,自动绑定
CREATE OR REPLACE FUNCTION public.bind_driver_auth_on_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.profiles
    SET auth_user_id = NEW.id
    WHERE email = NEW.email AND auth_user_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_bind_driver ON auth.users;
CREATE TRIGGER on_auth_user_created_bind_driver
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.bind_driver_auth_on_login();