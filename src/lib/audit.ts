import { supabase } from "@/integrations/supabase/client";

type AuditInput = {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  entity_label?: string | null;
  details?: Record<string, unknown> | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
};

export async function logAudit(input: AuditInput) {
  try {
    await supabase.from("audit_logs").insert({
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      entity_label: input.entity_label ?? null,
      details: (input.details ?? null) as never,
      actor_id: input.actor_id ?? null,
      actor_name: input.actor_name ?? null,
      actor_role: input.actor_role ?? null,
    });
  } catch (e) {
    // 审计日志失败不应阻塞业务
    // eslint-disable-next-line no-console
    console.warn("audit log failed", e);
  }
}

// 操作类型展示
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  order_create: "创建订单",
  order_cancel: "取消订单",
  order_assign: "分配订单",
  order_unassign: "取消分配",
  order_resequence: "调整顺序",
  order_reassign_driver: "改派司机",
  step_complete: "完成步骤",
  step_uncomplete: "撤销完成",
  bin_create: "新增桶",
  bin_update: "修改桶",
  vehicle_assign: "更换车辆",
  user_login: "用户登录",
  user_create: "新增用户",
  user_role_change: "调整角色",
};
