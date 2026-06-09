import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "dispatcher" | "driver";

export type CurrentUser = {
  session: Session | null;
  loading: boolean;
  profile: {
    id: string;
    name: string;
    email: string | null;
    auth_user_id: string;
    driver_language: "zh" | "en" | null;
  } | null;
  roles: AppRole[];
  hasRole: (r: AppRole) => boolean;
};

export function useCurrentUser(): CurrentUser {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CurrentUser["profile"]>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);

  useEffect(() => {
    let mounted = true;
    // 监听必须先于 getSession
    const sub = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) {
      setProfile(null);
      setRoles([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,name,email,auth_user_id,driver_language")
          .eq("auth_user_id", uid)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      if (cancelled) return;
      setProfile(p as CurrentUser["profile"]);
      setRoles((r ?? []).map((x: { role: AppRole }) => x.role));
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  return {
    session,
    loading,
    profile,
    roles,
    hasRole: (r) => roles.includes(r),
  };
}
