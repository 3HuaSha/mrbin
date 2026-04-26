import { useCallback } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { logAudit } from "@/lib/audit";

/**
 * 包装 logAudit,自动注入当前登录用户作为 actor。
 */
export function useAudit() {
  const { profile, hasRole } = useCurrentUser();
  return useCallback(
    (input: Omit<Parameters<typeof logAudit>[0], "actor_id" | "actor_name" | "actor_role">) => {
      const actorRole = hasRole("admin")
        ? "admin"
        : hasRole("dispatcher")
        ? "dispatcher"
        : hasRole("driver")
        ? "driver"
        : null;
      logAudit({
        ...input,
        actor_id: profile?.auth_user_id ?? null,
        actor_name: profile?.name ?? null,
        actor_role: actorRole,
      });
    },
    [profile, hasRole],
  );
}
