import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LayoutGrid } from "lucide-react";
import { logAudit } from "@/lib/audit";

export function StaffLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@kennedy.test");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/" });
    });
  }, [nav]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.user) {
      // 记录登录
      const { data: profile } = await supabase
        .from("profiles")
        .select("id,name")
        .eq("auth_user_id", data.user.id)
        .maybeSingle();
      logAudit({
        action: "user_login",
        entity_type: "user",
        entity_id: data.user.id,
        entity_label: profile?.name ?? data.user.email ?? "未知",
        actor_id: data.user.id,
        actor_name: profile?.name ?? data.user.email ?? null,
        actor_role: "staff",
      });
    }
    nav({ to: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-sm bg-card rounded-2xl p-6 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-3">
            <LayoutGrid className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">调度后台登录</h1>
          <p className="text-xs text-muted-foreground mt-1">Kennedy Depot</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>邮箱</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 mt-1 text-base"
              required
            />
          </div>
          <div>
            <Label>密码</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 mt-1 text-base"
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full h-12 text-base">
            {loading ? "登录中..." : "登录"}
          </Button>
          <div className="text-xs text-muted-foreground text-center pt-2 space-y-0.5">
            <div>测试账号:</div>
            <div className="font-mono">admin@kennedy.test / admin123</div>
            <div className="font-mono">dispatch@kennedy.test / dispatch123</div>
          </div>
        </form>
      </div>
    </div>
  );
}
