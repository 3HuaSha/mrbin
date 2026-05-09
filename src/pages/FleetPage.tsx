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

  // 获取司机已分配的车辆
  const getDriverVehicles = (driverId: string) => {
    const driverAssignments = assignments.filter(a => a.driver_id === driverId);
    return vehicles.filter(v => driverAssignments.some(a => a.vehicle_id === v.id));
  };

  // 根据筛选条件过滤司机
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
      const result = await fetchSamsaraData();
      if (!result.success) throw new Error(result.error || '获取数据失败');
      
      const samsaraVehicles = (result as any).vehicles || [];
      const samsaraDrivers = (result as any).drivers || [];
      const vehicleStats = (result as any).vehicleStats || [];

      // 1. 同步车辆
      await supabase.from("job_steps").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      await supabase.from("dispatch_assignments").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      const { error: deleteError } = await supabase.from("vehicles").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      if (deleteError) throw new Error(`清除旧数据失败: ${deleteError.message}`);

      const vehicleInserts: any[] = [];
      const uniquePlates = new Set();
      samsaraVehicles.forEach((v: any) => {
        if (!v.name) return;
        const plate = v.name.toUpperCase();
        if (uniquePlates.has(plate)) return;
        uniquePlates.add(plate);
        let type: "HINO" | "MACK" = "MACK";
        let size = "40";
        if (plate.includes("HINO") || plate.startsWith("BIN")) { type = "HINO"; size = "20"; }
        vehicleInserts.push({ name: v.name, type, plate, samsara_id: v.id, max_bin_size: size, is_active: true });
      });

      const { data: insertedVehicles, error: vError } = await supabase.from("vehicles").insert(vehicleInserts).select();
      if (vError) throw vError;
      const allVehicles = insertedVehicles || [];

      // 2. 清理并准备分配
      await supabase.from("driver_vehicle_assignments").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      const pendingAssignments = new Map<string, string>(); // driverInternalId -> vehicleInternalId

      // 3. 同步司机并收集分配
      let addedCount = 0;
      let updatedCount = 0;

      for (const sd of samsaraDrivers) {
        if (!sd.name) continue;
        const { data: existing } = await supabase.from("profiles").select("id").eq("name", sd.name).eq("role", "driver");
        let dId = '';
        if (existing && existing.length > 0) {
          dId = existing[0].id;
          await supabase.from("profiles").update({ phone: sd.phone || null, email: sd.email || null, is_active: true }).eq("id", dId);
          updatedCount++;
        } else {
          const { data: nw, error: nE } = await supabase.from("profiles").insert({ name: sd.name, phone: sd.phone || null, email: sd.email || null, role: "driver", is_active: true }).select().single();
          if (nE) continue;
          dId = nw.id;
          addedCount++;
        }
        const vRef = sd.currentVehicle || sd.staticAssignedVehicle;
        if (dId && vRef?.id) {
          const v = allVehicles.find(veh => veh.samsara_id === vRef.id || veh.name.toUpperCase() === vRef.name.toUpperCase());
          if (v) pendingAssignments.set(dId, v.id);
        }
      }

      // 4. 补充 OBD 实时状态 (根据姓名)
      const { data: freshDrivers } = await supabase.from("profiles").select("id, name").eq("role", "driver");
      const driverNameToId = new Map(freshDrivers?.map(d => [d.name.toUpperCase(), d.id]));

      vehicleStats.forEach((stat: any) => {
        const dName = stat.obdDriver?.driver?.name;
        if (dName) {
          const dId = driverNameToId.get(dName.toUpperCase());
          const v = allVehicles.find(veh => veh.samsara_id === stat.id || veh.name.toUpperCase() === stat.name.toUpperCase());
          if (dId && v) pendingAssignments.set(dId, v.id);
        }
      });

      const finalInserts = Array.from(pendingAssignments.entries()).map(([dId, vId]) => ({ driver_id: dId, vehicle_id: vId }));
      if (finalInserts.length > 0) await supabase.from("driver_vehicle_assignments").insert(finalInserts);

      return { vehicles: allVehicles.length, added: addedCount, updated: updatedCount, assignments: finalInserts.length };
    },
    onSuccess: (res) => {
      toast.success(`同步成功！车辆: ${res.vehicles}, 活跃分配: ${res.assignments}`);
      qc.invalidateQueries({ queryKey: ["vehicles-all"] });
      qc.invalidateQueries({ queryKey: ["drivers-all"] });
      qc.invalidateQueries({ queryKey: ["driver-vehicle-assignments"] });
    },
    onError: (e: Error) => toast.error(`同步失败: ${e.message}`),
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
    </div>
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
