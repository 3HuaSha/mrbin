import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { BIN_SIZES } from "@/lib/business";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Bin = {
  id: string;
  bin_number: string;
  size: string;
  status: string;
  current_address: string | null;
  current_order_id: string | null;
  last_moved_at: string;
  is_active: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  depot: "在库",
  in_transit: "运输中",
  on_site: "客户处",
  full: "已满",
};

const STATUS_CLASS: Record<string, string> = {
  depot: "bg-status-done/15 text-status-done",
  in_transit: "bg-status-progress/15 text-status-progress",
  on_site: "bg-status-assigned/15 text-status-assigned",
  full: "bg-destructive/15 text-destructive",
};

export function BinsPage() {
  const qc = useQueryClient();
  const [sizeFilter, setSizeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Bin | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: bins = [] } = useQuery({
    queryKey: ["bins-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bins").select("*").order("bin_number");
      if (error) throw error;
      return (data ?? []) as Bin[];
    },
  });

  const filtered = bins.filter((b) => {
    if (sizeFilter !== "all" && b.size !== sizeFilter) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (search && !b.bin_number.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = BIN_SIZES.map((sz) => {
    const list = bins.filter((b) => b.size === sz && b.is_active);
    const depot = list.filter((b) => b.status === "depot").length;
    return { size: sz, depot, total: list.length };
  });

  const daysOut = (b: Bin) => {
    if (b.status === "depot") return 0;
    return Math.floor((Date.now() - new Date(b.last_moved_at).getTime()) / 86400000);
  };

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("bins").update({ status: status as any, last_moved_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("状态已更新"); qc.invalidateQueries({ queryKey: ["bins-list"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteBin = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bins").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("已删除"); qc.invalidateQueries({ queryKey: ["bins-list"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold">桶库存</h1>
        <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1" /> 添加新桶</Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        {stats.map((s) => (
          <div key={s.size} className="bg-card border rounded-lg p-4">
            <div className="text-sm text-muted-foreground">{s.size}yd 桶</div>
            <div className="text-2xl font-bold mt-1">
              <span className="text-status-done">{s.depot}</span>
              <span className="text-muted-foreground text-base"> / {s.total}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">在库 / 共</div>
          </div>
        ))}
      </div>

      <div className="bg-card border rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs text-muted-foreground">尺寸</Label>
          <Select value={sizeFilter} onValueChange={setSizeFilter}>
            <SelectTrigger className="w-28 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {BIN_SIZES.map((s) => <SelectItem key={s} value={s}>{s}yd</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">状态</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs text-muted-foreground">搜索桶号</Label>
          <div className="relative mt-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="B-14-01" />
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2">桶号</th>
              <th className="px-3 py-2">尺寸</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">当前地址</th>
              <th className="px-3 py-2">在外天数</th>
              <th className="px-3 py-2">最后移动</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => {
              const days = daysOut(b);
              const isOpen = expanded === b.id;
              return (
                <BinRow key={b.id}
                  bin={b} days={days} isOpen={isOpen}
                  onToggle={() => setExpanded(isOpen ? null : b.id)}
                  onChangeStatus={(s) => updateStatus.mutate({ id: b.id, status: s })}
                  onEdit={() => setEditing(b)}
                  onDelete={() => {
                    if (confirm(`确定删除桶 ${b.bin_number} 吗？`)) deleteBin.mutate(b.id);
                  }}
                />
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">没有匹配的桶</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {adding && <AddBinDialog onClose={() => setAdding(false)} />}
      {editing && <EditBinDialog bin={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BinRow({
  bin, days, isOpen, onToggle, onChangeStatus, onEdit, onDelete,
}: { 
  bin: Bin; days: number; isOpen: boolean; 
  onToggle: () => void; onChangeStatus: (s: string) => void;
  onEdit: () => void; onDelete: () => void;
}) {
  const dayClass = days > 30 ? "text-destructive font-bold" : days > 15 ? "text-status-progress font-semibold" : "";
  return (
    <>
      <tr className="border-t hover:bg-accent/30 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
        <td className="px-3 py-2 font-mono">{bin.bin_number}</td>
        <td className="px-3 py-2">{bin.size}yd</td>
        <td className="px-3 py-2"><Badge className={cn("text-xs", STATUS_CLASS[bin.status])}>{STATUS_LABEL[bin.status]}</Badge></td>
        <td className="px-3 py-2 max-w-[260px] truncate">{bin.current_address || "—"}</td>
        <td className={cn("px-3 py-2", dayClass)}>{days > 0 ? `${days} 天` : "—"}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(bin.last_moved_at).toLocaleString("zh-CN")}</td>
        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            <Select value={bin.status} onValueChange={onChangeStatus}>
              <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-accent/20 border-t">
          <td colSpan={8} className="px-6 py-3"><BinHistory binId={bin.id} /></td>
        </tr>
      )}
    </>
  );
}

function BinHistory({ binId }: { binId: string }) {
  const { data: hist = [] } = useQuery({
    queryKey: ["bin-history", binId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bin_history").select("*").eq("bin_id", binId).order("recorded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  if (hist.length === 0) return <div className="text-xs text-muted-foreground">暂无移动记录</div>;
  return (
    <ol className="space-y-1.5">
      {hist.map((h: any) => (
        <li key={h.id} className="text-xs flex items-center gap-3">
          <span className="text-muted-foreground w-36">{new Date(h.recorded_at).toLocaleString("zh-CN")}</span>
          <Badge variant="outline" className="text-[10px]">{h.event}</Badge>
          <span>{h.from_location || "—"} → {h.to_location || "—"}</span>
        </li>
      ))}
    </ol>
  );
}

function AddBinDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [binNumber, setBinNumber] = useState("");
  const [size, setSize] = useState<string>("20");
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bins").insert({ bin_number: binNumber.trim(), size: size as any } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("已添加"); qc.invalidateQueries({ queryKey: ["bins-list"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>添加新桶</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>桶号</Label><Input value={binNumber} onChange={(e) => setBinNumber(e.target.value)} placeholder="B-20-99" /></div>
          <div>
            <Label>尺寸</Label>
            <Select value={size} onValueChange={setSize}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BIN_SIZES.map((s) => <SelectItem key={s} value={s}>{s}yd</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => add.mutate()} disabled={!binNumber.trim() || add.isPending}>添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditBinDialog({ bin, onClose }: { bin: Bin; onClose: () => void }) {
  const qc = useQueryClient();
  const [binNumber, setBinNumber] = useState(bin.bin_number);
  const [size, setSize] = useState<string>(bin.size);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bins").update({ bin_number: binNumber.trim(), size: size as any } as any).eq("id", bin.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("已保存"); qc.invalidateQueries({ queryKey: ["bins-list"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>编辑桶信息</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>桶号</Label><Input value={binNumber} onChange={(e) => setBinNumber(e.target.value)} /></div>
          <div>
            <Label>尺寸</Label>
            <Select value={size} onValueChange={setSize}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BIN_SIZES.map((s) => <SelectItem key={s} value={s}>{s}yd</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => save.mutate()} disabled={!binNumber.trim() || save.isPending}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

