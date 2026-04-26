import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollText, Search, Filter, User } from "lucide-react";
import { AUDIT_ACTION_LABEL } from "@/lib/audit";
import { cn } from "@/lib/utils";

type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  recorded_at: string;
};

const ACTION_COLOR: Record<string, string> = {
  order_create: "bg-status-done/15 text-status-done",
  order_assign: "bg-status-assigned/15 text-status-assigned",
  order_unassign: "bg-status-cancelled/15 text-status-cancelled",
  order_cancel: "bg-status-cancelled/15 text-status-cancelled",
  step_complete: "bg-primary/15 text-primary",
  user_login: "bg-muted text-muted-foreground",
};

export function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("all");

  const { data: rows = [], refetch } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("recorded_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const actors = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) {
      if (r.actor_id && r.actor_name) set.set(r.actor_id, r.actor_name);
    }
    return Array.from(set.entries());
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (actorFilter !== "all" && r.actor_id !== actorFilter) return false;
      if (q) {
        const text = [
          r.actor_name,
          r.entity_label,
          r.entity_id,
          r.action,
          JSON.stringify(r.details ?? {}),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, actionFilter, actorFilter]);

  const actionOpts = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.action);
    return Array.from(set).sort();
  }, [rows]);

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="h-6 w-6" /> 审计日志
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            所有关键操作的不可改写记录,共 {rows.length} 条 (最近500条)
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ↻ 刷新
        </button>
      </header>

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索操作人 / 订单号 / 详情..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-44 h-9">
            <Filter className="h-3.5 w-3.5 mr-1" />
            <SelectValue placeholder="操作类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部操作</SelectItem>
            {actionOpts.map((a) => (
              <SelectItem key={a} value={a}>
                {AUDIT_ACTION_LABEL[a] ?? a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actorFilter} onValueChange={setActorFilter}>
          <SelectTrigger className="w-44 h-9">
            <User className="h-3.5 w-3.5 mr-1" />
            <SelectValue placeholder="操作人" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部用户</SelectItem>
            {actors.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">时间</th>
                <th className="px-3 py-2 font-medium">操作人</th>
                <th className="px-3 py-2 font-medium">操作</th>
                <th className="px-3 py-2 font-medium">对象</th>
                <th className="px-3 py-2 font-medium">详情</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted-foreground py-8">
                    没有匹配的记录
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30 align-top">
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.recorded_at).toLocaleString("zh-CN", { hour12: false })}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="font-medium">{r.actor_name ?? "—"}</div>
                      {r.actor_role && (
                        <div className="text-muted-foreground">{r.actor_role}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        className={cn(
                          "text-[10px] font-normal",
                          ACTION_COLOR[r.action] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {AUDIT_ACTION_LABEL[r.action] ?? r.action}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="font-medium font-mono">{r.entity_label ?? "—"}</div>
                      <div className="text-muted-foreground">{r.entity_type}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-md">
                      {r.details && Object.keys(r.details).length > 0 ? (
                        <pre className="font-mono text-[10px] whitespace-pre-wrap break-all bg-muted/40 rounded p-1.5">
                          {JSON.stringify(r.details, null, 2)}
                        </pre>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
