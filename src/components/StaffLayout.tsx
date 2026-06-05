import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  ClipboardList,
  Construction,
  LayoutGrid,
  PackageCheck,
  PlusSquare,
  Truck,
  Map as MapIcon,
  BarChart3,
  ScrollText,
  Users,
  LogOut,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser, type AppRole } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type NavItem = {
  to: string;
  label: string;
  icon: typeof PlusSquare;
  exact?: boolean;
  roles?: AppRole[]; // 默认所有 staff 角色都能看
};

const NAV: NavItem[] = [
  { to: "/", label: "下单", icon: PlusSquare, exact: true },
  { to: "/orders", label: "订单", icon: ClipboardList },
  { to: "/cement", label: "水泥", icon: Construction },
  { to: "/dispatch", label: "排班", icon: LayoutGrid },
  { to: "/map", label: "实时地图", icon: MapIcon },
  { to: "/bins", label: "桶库存", icon: PackageCheck },
  { to: "/fleet", label: "车队", icon: Truck },
  { to: "/reports", label: "司机监督", icon: BarChart3 },
  // { to: "/audit", label: "审计日志", icon: ScrollText, roles: ["admin"] },
  { to: "/users", label: "用户管理", icon: Users, roles: ["admin"] },
];

export function StaffLayout() {
  const location = useLocation();
  const path = location.pathname;
  const nav = useNavigate();
  const { session, loading, profile, roles, hasRole } = useCurrentUser();
  const [redirecting, setRedirecting] = useState(false);

  // 未登录跳到登录页
  useEffect(() => {
    if (loading) return;
    if (!session) {
      setRedirecting(true);
      nav({ to: "/staff/login" });
      return;
    }
    // 登录了但没有 staff 角色
    if (roles.length > 0 && !hasRole("admin") && !hasRole("dispatcher")) {
      // 如果是司机就送到司机端
      if (hasRole("driver")) nav({ to: "/driver" });
      else {
        supabase.auth.signOut().then(() => nav({ to: "/staff/login" }));
      }
    }
  }, [session, loading, roles, hasRole, nav]);

  if (loading || redirecting || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visibleNav = NAV.filter((n) => !n.roles || n.roles.some((r) => hasRole(r)));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    nav({ to: "/staff/login" });
  };

  const roleLabel = hasRole("admin") ? "管理员" : hasRole("dispatcher") ? "调度员" : "员工";

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="w-56 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="text-lg font-bold tracking-wide">Kennedy Depot</div>
          <div className="text-xs text-sidebar-foreground/60 mt-0.5">调度运营系统</div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const active = item.exact ? path === item.to : path.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="px-3 py-2 text-xs text-sidebar-foreground/70">
            <div className="font-semibold text-sidebar-foreground">{profile?.name ?? "—"}</div>
            <div className="opacity-70">{roleLabel}</div>
          </div>
          <Button
            onClick={handleLogout}
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4 mr-2" />
            退出
          </Button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
