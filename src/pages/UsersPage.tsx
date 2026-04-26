import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, KeyRound, UserCog, Shield, Truck, LayoutGrid } from "lucide-react";
import {
  createStaffOrDriverUser,
  resetUserPassword,
  setUserRole,
  toggleProfileActive,
} from "@/server/users";
import { useAudit } from "@/hooks/use-audit";
import { cn } from "@/lib/utils";

type AppRole = "admin" | "dispatcher" | "driver";

type ProfileRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "staff" | "driver";
  is_active: boolean;
  auth_user_id: string | null;
  created_at: string;
};

type RoleRow = { user_id: string; role: AppRole };

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "管理员",
  dispatcher: "调度员",
  driver: "司机",
};
const ROLE_ICON: Record<AppRole, typeof Shield> = {
  admin: Shield,
  dispatcher: LayoutGrid,
  driver: Truck,
};

export function UsersPage() {
  const qc = useQueryClient();
  const audit = useAudit();
  const [openNew, setOpenNew] = useState(false);
  const [pwDialog, setPwDialog] = useState<ProfileRow | null>(null);
  const [pwValue, setPwValue] = useState("");

  const { data: profiles = [] } = useQuery({
    queryKey: ["users-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const { data: roleRows = [] } = useQuery({
    queryKey: ["user-roles-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id,role");
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
  });

  const rolesMap = useMemo(() => {
    const m = new Map<string, AppRole[]>();
    for (const r of roleRows) {
      const arr = m.get(r.user_id) ?? [];
      arr.push(r.role);
      m.set(r.user_id, arr);
    }
    return m;
  }, [roleRows]);

  // 创建用户
  const createUser = useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      name: string;
      phone?: string;
      role: AppRole;
    }) => {
      return await createStaffOrDriverUser({ data: input });
    },
    onSuccess: (res, vars) => {
      toast.success(`用户 ${vars.name} 已创建`);
      audit({
        action: "user_create",
        entity_type: "user",
        entity_id: res.user_id,
        entity_label: vars.name,
        details: { email: vars.email, role: vars.role },
      });
      qc.invalidateQueries({ queryKey: ["users-profiles"] });
      qc.invalidateQueries({ queryKey: ["user-roles-all"] });
      setOpenNew(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleRole = useMutation({
    mutationFn: async (input: { user_id: string; role: AppRole; enabled: boolean }) => {
      return await setUserRole({ data: input });
    },
    onSuccess: (_r, vars) => {
      audit({
        action: "user_role_change",
        entity_type: "user",
        entity_id: vars.user_id,
        details: { role: vars.role, enabled: vars.enabled },
      });
      qc.invalidateQueries({ queryKey: ["user-roles-all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPw = useMutation({
    mutationFn: async (input: { user_id: string; password: string }) => {
      return await resetUserPassword({ data: input });
    },
    onSuccess: () => {
      toast.success("密码已重置");
      setPwDialog(null);
      setPwValue("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (input: { profile_id: string; is_active: boolean }) => {
      return await toggleProfileActive({ data: input });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users-profiles"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCog className="h-6 w-6" /> 用户管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理司机、调度员、管理员账号与角色
          </p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" /> 新增用户
            </Button>
          </DialogTrigger>
          <NewUserDialog
            onSubmit={(v) => createUser.mutate(v)}
            loading={createUser.isPending}
          />
        </Dialog>
      </header>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-left">
            <tr>
              <th className="px-3 py-2 font-medium">姓名</th>
              <th className="px-3 py-2 font-medium">邮箱 / 手机</th>
              <th className="px-3 py-2 font-medium">角色</th>
              <th className="px-3 py-2 font-medium">状态</th>
              <th className="px-3 py-2 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const userRoles = (p.auth_user_id && rolesMap.get(p.auth_user_id)) || [];
              return (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.name}</div>
                    {!p.auth_user_id && (
                      <Badge variant="outline" className="text-[10px] mt-0.5">
                        未绑定登录
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <div>{p.email ?? "—"}</div>
                    {p.phone && <div>{p.phone}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(["admin", "dispatcher", "driver"] as AppRole[]).map((role) => {
                        const has = userRoles.includes(role);
                        const Icon = ROLE_ICON[role];
                        const disabled = !p.auth_user_id || toggleRole.isPending;
                        return (
                          <button
                            key={role}
                            disabled={disabled}
                            onClick={() =>
                              toggleRole.mutate({
                                user_id: p.auth_user_id!,
                                role,
                                enabled: !has,
                              })
                            }
                            className={cn(
                              "text-[10px] px-2 py-1 rounded border flex items-center gap-1 transition",
                              has
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground border-border hover:border-primary/40",
                              disabled && "opacity-50 cursor-not-allowed",
                            )}
                          >
                            <Icon className="h-3 w-3" /> {ROLE_LABEL[role]}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        p.is_active
                          ? "border-status-done/40 text-status-done"
                          : "border-muted-foreground/40 text-muted-foreground",
                      )}
                    >
                      {p.is_active ? "启用" : "停用"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!p.auth_user_id}
                      onClick={() => {
                        setPwDialog(p);
                        setPwValue("");
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5 mr-1" /> 重置密码
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        toggleActive.mutate({ profile_id: p.id, is_active: !p.is_active })
                      }
                    >
                      {p.is_active ? "停用" : "启用"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* 重置密码弹窗 */}
      <Dialog open={!!pwDialog} onOpenChange={(o) => !o && setPwDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置 {pwDialog?.name} 的密码</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>新密码 (至少 6 位)</Label>
            <Input
              type="text"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              placeholder="新密码"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwDialog(null)}>
              取消
            </Button>
            <Button
              disabled={pwValue.length < 6 || resetPw.isPending}
              onClick={() =>
                pwDialog?.auth_user_id &&
                resetPw.mutate({ user_id: pwDialog.auth_user_id, password: pwValue })
              }
            >
              {resetPw.isPending ? "提交中..." : "确认重置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewUserDialog({
  onSubmit,
  loading,
}: {
  onSubmit: (v: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    role: AppRole;
  }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<AppRole>("driver");

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>新增用户</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>姓名</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>邮箱(用于登录)</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label>初始密码 (至少 6 位)</Label>
          <Input value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <Label>手机 (可选)</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label>角色</Label>
          <Select value={role} onValueChange={(v: AppRole) => setRole(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="driver">司机</SelectItem>
              <SelectItem value="dispatcher">调度员</SelectItem>
              <SelectItem value="admin">管理员</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={loading || !name || !email || password.length < 6}
          onClick={() =>
            onSubmit({ name, email, password, phone: phone || undefined, role })
          }
        >
          {loading ? "创建中..." : "创建"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
