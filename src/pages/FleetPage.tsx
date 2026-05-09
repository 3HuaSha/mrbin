import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Power, Pencil, Trash2, RefreshCw } from "lucide-react";
import { formatPhone } from "@/lib/business";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fetchSamsaraData } from "@/actions/samsara";

type Driver = { id: string; name: string; phone: string | null; email: string | null; is_active: boolean };
type Vehicle = { id: string; name: string; type: "HINO" | "MACK"; plate: string; samsara_id: string | null; max_bin_size: string | null; is_active: boolean };
type DriverVehicleAssignment = { id: string; driver_id: string; vehicle_id: string; assigned_at: string; notes: string | null };

export function FleetPage() {
  const qc = useQueryClient();
  const [addingDriver, setAddingDriver] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>("ALL");
  const [driverFilter, setDriverFilter] = useState<"ALL" | "ASSIGNED">("ASSIGNED");
  const [assigningDriver, setAssigningDriver] = useState<Driver | null>(null);
  const [syncAnalysis, setSyncAnalysis] = useState<{
    totalDrivers: number;
    driversWithRefs: Array<{ name: string; ref: string; source: string; matched: boolean }>;
  } | null>(null);

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,name,phone,email,is_active").eq("role", "driver").order("name");
      if (error) throw error;
      return data as Driver[];
    },
  });
  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").order("name");
      if (error) throw error;
      return data as Vehicle[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["driver-vehicle-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("driver_vehicle_assignments").select("*");
      if (error) throw error;
      return data as DriverVehicleAssignment[];
    },
  });

  const getDriverVehicles = (driverId: string) => {
    const driverAssignments = assignments.filter(a => a.driver_id === driverId);
    return vehicles.filter(v => driverAssignments.some(a => a.vehicle_id === v.id));
  };

  const filteredDrivers = drivers.filter(d => {
    if (driverFilter === "ASSIGNED") {
      return getDriverVehicles(d.id).length > 0;
    }
    return true;
  });

  const extractVehiclePrefix = (name: string): string => {
    if (!name) return "OTHER";
    const upperName = name.toUpperCase();
    if (upperName.startsWith("BIN")) return "BIN";
    if (upperName.startsWith("FLAT")) return "FLAT";
    if (upperName.startsWith("DUMP")) return "DUMP";
    if (upperName.startsWith("HINO")) return "HINO";
    if (upperName.startsWith("MACK")) return "MACK";
    if (upperName.startsWith("PROALL")) return "PROALL";
    const match = upperName.match(/^([A-Z]+)[#\s\-_0-9]/) || upperName.match(/^([A-Z]+)$/);
    return match ? match[1] : "OTHER";
  };

  const vehicleTypes = ["ALL", ...Array.from(new Set(vehicles.map(v => extractVehiclePrefix(v.name)))).sort()];

  const filteredVehicles = vehicleTypeFilter === "ALL" 
    ? vehicles 
    : vehicles.filter(v => extractVehiclePrefix(v.name) === vehicleTypeFilter);

  const toggleDriver = useMutation({
    mutationFn: async (d: Driver) => {
      const { error } = await supabase.from("profiles").update({ is_active: !d.is_active }).eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["drivers-all"] }); },
  });
  const toggleVehicle = useMutation({
    mutationFn: async (v: Vehicle) => {
      const { error } = await supabase.from("vehicles").update({ is_active: !v.is_active }).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicles-all"] }); },
  });

  const syncSamsara = useMutation({
    mutationFn: async () => {
      console.group('🔍 Samsara 同步调试详情');
      const result = await fetchSamsaraData();
      if (!result.success) throw new Error(result.error || '获取数据失败');
      
      const { vehicles: sVehicles = [], drivers: sDrivers = [], assignments: sAssigns = [], vehicleStats: sStats = [] } = result as any;
      (window as any).__SAMSARA_DEBUG__ = { sVehicles, sDrivers, sAssigns, sStats };
      
      console.log('📦 原始数据已存入 window.__SAMSARA_DEBUG__');
      console.log(`📊 统计: 车辆/资产(${sVehicles.length}), 司机(${sDrivers.length}), 分配(${sAssigns.length}), Stats(${sStats.length})`);

      // 1. 同步车辆与资产
      await supabase.from("job_steps").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      await supabase.from("dispatch_assignments").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      await supabase.from("vehicles").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);

      const vehicleInserts = sVehicles.filter((v: any) => v.name).map((v: any) => {
        const plate = v.name.toUpperCase().trim();
        // 根据名称判断类型
        let type: "HINO" | "MACK" = "MACK";
        let size = "40";
        if (plate.includes("HINO") || plate.startsWith("BIN") || plate.startsWith("FLAT")) {
          type = "HINO";
          size = "20";
        }
        return { name: v.name, type, plate, samsara_id: v.id, max_bin_size: size, is_active: true };
      });

      const { data: insertedVehicles, error: vError } = await supabase.from("vehicles").insert(vehicleInserts).select();
      if (vError) throw vError;
      const allVehicles = insertedVehicles || [];

      // 2. 同步司机
      await supabase.from("driver_vehicle_assignments").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      const dSamsaraIdToInternal = new Map<string, string>();
      const dNameToInternal = new Map<string, string>();

      for (const sd of sDrivers) {
        if (!sd.name) continue;
        const { data: existing } = await supabase.from("profiles").select("id").eq("name", sd.name).eq("role", "driver");
        let dId = '';
        if (existing && existing.length > 0) {
          dId = existing[0].id;
          await supabase.from("profiles").update({ phone: sd.phone || null, is_active: true }).eq("id", dId);
        } else {
          const { data: nw } = await supabase.from("profiles").insert({ name: sd.name, phone: sd.phone || null, role: "driver", is_active: true }).select().single();
          if (nw) dId = nw.id;
        }
        if (dId) {
          dSamsaraIdToInternal.set(sd.id, dId);
          dNameToInternal.set(sd.name.toUpperCase().trim(), dId);
        }
      }

      // 3. 匹配关联 (寻找当前“正在开车”的司机)
      const pending = new Map<string, string>(); // dId -> vId
      const clean = (s: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const analysisData: Array<{ name: string; ref: string; source: string; matched: boolean }> = [];

      console.group('🎯 自动关联逻辑');
      sDrivers.forEach((sd: any) => {
        const dId = dSamsaraIdToInternal.get(sd.id) || dNameToInternal.get(clean(sd.name));
        if (!dId) return;

        let vRef = null;
        let source = '';
        const assign = sAssigns.find((a: any) => a.driver?.id === sd.id || clean(a.driver?.name) === clean(sd.name));
        if (assign) { vRef = assign.vehicle; source = 'Samsara分配接口'; }

        if (!vRef?.id) {
          const stat = sStats.find((s: any) => clean(s.obdDriver?.driver?.name) === clean(sd.name));
          if (stat) { vRef = { id: stat.id, name: stat.name }; source = '车辆OBD实时状态'; }
        }

        if (!vRef?.id) {
          const profileRef = sd.currentVehicle || sd.staticAssignedVehicle;
          if (profileRef) { vRef = profileRef; source = 'Samsara司机档案关联'; }
        }

        if (vRef) {
          const vehicle = allVehicles.find(v => (vRef.id && v.samsara_id === vRef.id) || (vRef.name && clean(v.name) === clean(vRef.name)));
          const matched = !!vehicle;
          if (matched) pending.set(dId, vehicle.id);
          analysisData.push({ name: sd.name, ref: vRef.name || vRef.id, source, matched });
        }
      });
      console.groupEnd();

      const finalInserts = Array.from(pending.entries()).map(([dId, vId]) => ({ driver_id: dId, vehicle_id: vId }));
      if (finalInserts.length > 0) {
        await supabase.from("driver_vehicle_assignments").insert(finalInserts);
      }

      console.groupEnd();
      setSyncAnalysis({ totalDrivers: sDrivers.length, driversWithRefs: analysisData });
      if (finalInserts.length > 0) {
        await supabase.from("driver_vehicle_assignments").insert(finalInserts);
      }

      console.groupEnd();
      return { vehicles: allVehicles.length, assignments: finalInserts.length, drivers: sDrivers.length };
    },
    onSuccess: (res) => {
      toast.success(`同步完成！车辆: ${res.vehicles}, 司机: ${res.drivers}, 活跃分配: ${res.assignments}`);
      qc.invalidateQueries({ queryKey: ["vehicles-all"] });
      qc.invalidateQueries({ queryKey: ["drivers-all"] });
      qc.invalidateQueries({ queryKey: ["driver-vehicle-assignments"] });
    },
    onError: (e: Error) => {
      console.groupEnd();
      toast.error(`同步失败: ${e.message}`);
    }
  });

  const deleteDriver = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("已删除司机"); qc.invalidateQueries({ queryKey: ["drivers-all"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteVehicle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("已删除车辆"); qc.invalidateQueries({ queryKey: ["vehicles-all"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-5">司机与车辆</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">司机 ({filteredDrivers.length}/{drivers.length})</h2>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant={driverFilter === "ASSIGNED" ? "default" : "outline"}
                onClick={() => setDriverFilter(driverFilter === "ALL" ? "ASSIGNED" : "ALL")}
              >
                {driverFilter === "ASSIGNED" ? "已分配车辆" : "全部司机"}
              </Button>
              <Button size="sm" onClick={() => setAddingDriver(true)}><Plus className="h-4 w-4 mr-1" /> 添加司机</Button>
            </div>
          </div>
          <div className="space-y-2">
            {filteredDrivers.map((d) => (
              <div key={d.id} className={cn("bg-card border rounded-lg p-3", !d.is_active && "opacity-50")}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center">
                    {d.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.phone || "—"} · {d.email || "未关联账号"}</div>
                  </div>
                  <Badge variant={d.is_active ? "default" : "secondary"}>{d.is_active ? "在岗" : "停用"}</Badge>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditingDriver(d)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => toggleDriver.mutate(d)}><Power className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => {
                      if (confirm(`确定删除司机 ${d.name} 吗？`)) deleteDriver.mutate(d.id);
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="ml-13 space-y-1">
                  {getDriverVehicles(d.id).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {getDriverVehicles(d.id).map(v => (
                        <Badge key={v.id} variant="outline" className="text-xs">{v.name}</Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">未分配车辆</div>
                  )}
                  <Button size="sm" variant="outline" className="mt-1" onClick={() => setAssigningDriver(d)}>
                    <Plus className="h-3 w-3 mr-1" /> 分配车辆
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">车辆 ({filteredVehicles.length}/{vehicles.length})</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => syncSamsara.mutate()} disabled={syncSamsara.isPending}>
                <RefreshCw className={cn("h-4 w-4 mr-1", syncSamsara.isPending && "animate-spin")} />
                从 Samsara 同步
              </Button>
              <Button size="sm" onClick={() => setAddingVehicle(true)}>
                <Plus className="h-4 w-4 mr-1" /> 添加车辆
              </Button>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {vehicleTypes.map((type) => (
              <Button
                key={type}
                size="sm"
                variant={vehicleTypeFilter === type ? "default" : "outline"}
                onClick={() => setVehicleTypeFilter(type)}
              >
                {type === "ALL" ? "全部" : type}
                {type !== "ALL" && ` (${vehicles.filter(v => extractVehiclePrefix(v.name) === type).length})`}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            {filteredVehicles.map((v) => (
              <div key={v.id} className={cn("bg-card border rounded-lg p-3 flex items-center gap-3", !v.is_active && "opacity-50")}>
                <div className="flex-1">
                  <div className="font-medium flex items-center gap-2">
                    {v.name}
                    <Badge variant="outline" className="text-[10px]">{v.type}</Badge>
                    <span className="text-xs text-muted-foreground">最大 {v.max_bin_size}yd</span>
                  </div>
                  <div className="text-xs text-muted-foreground">车牌 {v.plate} · Samsara {v.samsara_id || "—"}</div>
                </div>
                <Badge variant={v.is_active ? "default" : "secondary"}>{v.is_active ? "可用" : "停用"}</Badge>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditingVehicle(v)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => toggleVehicle.mutate(v)}><Power className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => {
                    if (confirm(`确定删除车辆 ${v.name} 吗？`)) deleteVehicle.mutate(v.id);
                  }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {addingDriver && <AddDriverDialog onClose={() => setAddingDriver(false)} />}
      {addingVehicle && <AddVehicleDialog onClose={() => setAddingVehicle(false)} />}
      {editingDriver && <EditDriverDialog driver={editingDriver} onClose={() => setEditingDriver(null)} />}
      {editingVehicle && <EditVehicleDialog vehicle={editingVehicle} onClose={() => setEditingVehicle(null)} />}
      {assigningDriver && (
        <AssignVehicleDialog 
          driver={assigningDriver} 
          vehicles={vehicles}
          assignments={assignments}
          onClose={() => setAssigningDriver(null)} 
        />
      )}
      {syncAnalysis && (
        <SyncAnalysisDialog 
          analysis={syncAnalysis} 
          onClose={() => setSyncAnalysis(null)} 
        />
      )}
    </div>
  );
}

function SyncAnalysisDialog({ analysis, onClose }: { analysis: any; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>同步关联分析 (找到 {analysis.driversWithRefs.length} 条关联引用)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="text-sm text-muted-foreground">
            系统从 Samsara 抓取了 {analysis.totalDrivers} 名司机，并尝试通过以下来源寻找车辆分配。
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground font-medium">
                <tr>
                  <th className="p-2 text-left">司机</th>
                  <th className="p-2 text-left">Samsara车辆引用</th>
                  <th className="p-2 text-left">数据来源</th>
                  <th className="p-2 text-left">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {analysis.driversWithRefs.map((item: any, i: number) => (
                  <tr key={i} className={cn(!item.matched && "bg-destructive/5")}>
                    <td className="p-2 font-medium">{item.name}</td>
                    <td className="p-2 font-mono text-xs">{item.ref}</td>
                    <td className="p-2 text-xs text-muted-foreground">{item.source}</td>
                    <td className="p-2">
                      {item.matched ? (
                        <Badge variant="default" className="bg-green-500 hover:bg-green-600">已自动关联</Badge>
                      ) : (
                        <Badge variant="destructive">未匹配本地车辆</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {analysis.driversWithRefs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      未在 Samsara 中发现任何活跃的驾驶员-车辆关联记录。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!analysis.driversWithRefs.some((it: any) => it.matched) && analysis.driversWithRefs.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
              <strong>提示：</strong> 找到了关联引用但匹配失败，通常是因为 Samsara 中的车辆名称或 ID 与本地数据库中的不一致。请检查右侧车辆列表中的 <strong>Samsara ID</strong> 是否已正确同步。
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { createStaffOrDriverUser } from "@/actions/users";

function AddDriverDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      if (!email || !password) throw new Error("邮箱和密码必填");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("未登录");
      return await createStaffOrDriverUser({
        data: { name: name.trim(), email: email.trim(), password, phone: phone || undefined, role: "driver", accessToken: token }
      });
    },
    onSuccess: () => { 
      toast.success("已添加司机"); 
      qc.invalidateQueries({ queryKey: ["drivers-all"] }); 
      onClose(); 
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>添加司机</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>姓名</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>电话</Label><Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} /></div>
          <div><Label>登录邮箱</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>初始密码</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => add.mutate()} disabled={!name.trim() || !email || password.length < 6 || add.isPending}>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDriverDialog({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(driver.name);
  const [phone, setPhone] = useState(driver.phone || "");
  const [email, setEmail] = useState(driver.email || "");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update({ name: name.trim(), phone: phone || null, email: email || null }).eq("id", driver.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("已保存"); qc.invalidateQueries({ queryKey: ["drivers-all"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>编辑司机</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>姓名</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>电话</Label><Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} /></div>
          <div><Label>邮箱</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddVehicleDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<"HINO" | "MACK">("MACK");
  const [plate, setPlate] = useState("");
  const [samsara, setSamsara] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("vehicles").insert({ name: name.trim(), type, plate: plate.trim(), samsara_id: samsara || null, max_bin_size: type === "HINO" ? "20" : "40" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("已添加车辆"); qc.invalidateQueries({ queryKey: ["vehicles-all"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>添加车辆</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>车辆名</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>车牌</Label><Input value={plate} onChange={(e) => setPlate(e.target.value)} /></div>
          <div><Label>Samsara ID</Label><Input value={samsara} onChange={(e) => setSamsara(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => add.mutate()} disabled={!name.trim() || !plate.trim() || add.isPending}>添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditVehicleDialog({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(vehicle.name);
  const [type, setType] = useState<"HINO" | "MACK">(vehicle.type);
  const [plate, setPlate] = useState(vehicle.plate);
  const [samsara, setSamsara] = useState(vehicle.samsara_id || "");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("vehicles").update({ name: name.trim(), type, plate: plate.trim(), samsara_id: samsara || null, max_bin_size: type === "HINO" ? "20" : "40" }).eq("id", vehicle.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("已保存"); qc.invalidateQueries({ queryKey: ["vehicles-all"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>编辑车辆</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>车辆名</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>车牌</Label><Input value={plate} onChange={(e) => setPlate(e.target.value)} /></div>
          <div><Label>Samsara ID</Label><Input value={samsara} onChange={(e) => setSamsara(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || !plate.trim() || save.isPending}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignVehicleDialog({ driver, vehicles, assignments, onClose }: { driver: Driver; vehicles: Vehicle[]; assignments: any[]; onClose: () => void; }) {
  const qc = useQueryClient();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const assign = useMutation({
    mutationFn: async () => {
      if (!selectedVehicleId) return;
      await supabase.from("driver_vehicle_assignments").delete().eq("driver_id", driver.id);
      const { error } = await supabase.from("driver_vehicle_assignments").insert({ driver_id: driver.id, vehicle_id: selectedVehicleId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("已分配"); qc.invalidateQueries({ queryKey: ["driver-vehicle-assignments"] }); onClose(); },
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>分配车辆</DialogTitle></DialogHeader>
        <Select onValueChange={setSelectedVehicleId}>
          <SelectTrigger><SelectValue placeholder="选择车辆" /></SelectTrigger>
          <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => assign.mutate()} disabled={!selectedVehicleId}>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
