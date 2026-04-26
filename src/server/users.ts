import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AppRole = "admin" | "dispatcher" | "driver";

// 调用者必须是 admin 才能用
async function ensureAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((x) => x.role);
  if (!roles.includes("admin")) throw new Error("只有管理员可以执行此操作");
}

// 创建司机或调度账号
export const createStaffOrDriverUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      email: string;
      password: string;
      name: string;
      phone?: string;
      role: AppRole;
    }) => {
      if (!input.email?.includes("@")) throw new Error("邮箱无效");
      if (!input.password || input.password.length < 6)
        throw new Error("密码至少 6 位");
      if (!input.name?.trim()) throw new Error("姓名必填");
      if (!["admin", "dispatcher", "driver"].includes(input.role))
        throw new Error("角色无效");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);

    // 1. 创建 auth user
    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (authErr) throw new Error(authErr.message);
    const newUserId = created.user!.id;

    // 2. 创建 profile
    const profileRole: "staff" | "driver" = data.role === "driver" ? "driver" : "staff";
    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      name: data.name.trim(),
      email: data.email,
      phone: data.phone || null,
      role: profileRole,
      auth_user_id: newUserId,
    });
    if (pErr) throw new Error(pErr.message);

    // 3. 角色
    await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: newUserId, role: data.role },
        { onConflict: "user_id,role" },
      );

    return { ok: true, user_id: newUserId };
  });

// 修改角色 (增加或删除)
export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { user_id: string; role: AppRole; enabled: boolean }) => input,
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    if (data.enabled) {
      await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: data.user_id, role: data.role },
          { onConflict: "user_id,role" },
        );
    } else {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", data.role);
    }
    return { ok: true };
  });

// 重置密码
export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; password: string }) => {
    if (!input.password || input.password.length < 6) throw new Error("密码至少 6 位");
    return input;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// 启用/禁用 profile
export const toggleProfileActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { profile_id: string; is_active: boolean }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.is_active })
      .eq("id", data.profile_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
