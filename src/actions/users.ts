import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AppRole = "admin" | "dispatcher" | "driver";

/**
 * 手动验证管理员身份
 * 优先使用 middleware 传来的 userId，如果没有则使用 accessToken 换取 userId
 */
async function getAdminUserId(accessToken?: string, contextUserId?: string) {
  let uid = contextUserId;
  console.log("[AdminCheck] contextUserId:", uid, "hasToken:", !!accessToken);

  if (!uid && accessToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    console.log("[AdminCheck] getUser result - userId:", data?.user?.id, "error:", error?.message);
    if (!error && data.user) {
      uid = data.user.id;
    }
  }

  if (!uid) throw new Error("未授权：请先登录");
  console.log("[AdminCheck] Final uid:", uid);

  const { data: roles, error: rErr } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", uid);

  console.log("[AdminCheck] roles:", JSON.stringify(roles), "error:", rErr?.message);

  if (rErr || !roles?.some(r => r.role === "admin")) {
    throw new Error("权限不足：只有管理员可以执行此操作");
  }

  return uid;
}

// 创建司机或调度账号
export const createStaffOrDriverUser = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      email: string;
      password: string;
      name: string;
      phone?: string;
      role: AppRole;
      accessToken?: string;
    }) => {
      if (!input.email?.includes("@")) throw new Error("邮箱无效");
      if (!input.password || input.password.length < 6) throw new Error("密码至少 6 位");
      if (!input.name?.trim()) throw new Error("姓名必填");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    // @ts-ignore
    await getAdminUserId(data.accessToken, context?.userId);
    console.log("[CreateUser] Starting creation for:", data.email);

    // 1. 创建 auth user
    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (authErr) {
      console.error("[CreateUser] Auth error:", authErr.message);
      throw new Error(authErr.message);
    }
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
      .upsert({ user_id: newUserId, role: data.role }, { onConflict: "user_id,role" });

    return { ok: true, user_id: newUserId };
  });

// 修改角色
export const setUserRole = createServerFn({ method: "POST" })
  .inputValidator((input: { user_id: string; role: AppRole; enabled: boolean; accessToken?: string }) => input)
  .handler(async ({ data, context }) => {
    // @ts-ignore
    await getAdminUserId(data.accessToken, context?.userId);
    if (data.enabled) {
      await supabaseAdmin.from("user_roles").upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
    } else {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", data.role);
    }
    return { ok: true };
  });

// 重置密码
export const resetUserPassword = createServerFn({ method: "POST" })
  .inputValidator((input: { user_id: string; password: string; accessToken?: string }) => input)
  .handler(async ({ data, context }) => {
    // @ts-ignore
    await getAdminUserId(data.accessToken, context?.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// 启用/禁用 profile
export const toggleProfileActive = createServerFn({ method: "POST" })
  .inputValidator((input: { profile_id: string; is_active: boolean; accessToken?: string }) => input)
  .handler(async ({ data, context }) => {
    // @ts-ignore
    await getAdminUserId(data.accessToken, context?.userId);
    const { error } = await supabaseAdmin.from("profiles").update({ is_active: data.is_active }).eq("id", data.profile_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// 绑定登录账号
export const bindAuthToProfile = createServerFn({ method: "POST" })
  .inputValidator((input: { profile_id: string; email: string; password: string; role: AppRole; accessToken?: string }) => input)
  .handler(async ({ data, context }) => {
    // @ts-ignore
    await getAdminUserId(data.accessToken, context?.userId);
    
    // 1. 创建 auth user
    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (authErr) throw new Error(authErr.message);
    const newUserId = created.user!.id;

    // 2. 回写 profiles
    await supabaseAdmin.from("profiles").update({ auth_user_id: newUserId, email: data.email }).eq("id", data.profile_id);

    // 3. 角色
    await supabaseAdmin.from("user_roles").upsert({ user_id: newUserId, role: data.role }, { onConflict: "user_id,role" });

    return { ok: true, user_id: newUserId };
  });
