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
import { fetchSamsaraVehicles } from "@/lib/samsara-api";

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

  // 提取车辆类型前缀（例如 "BIN#1" -> "BIN", "FLAT#2" -> "FLAT"）
  const extractVehiclePrefix = (name: string): string => {
    const match = name.match(/^([A-Z]+)#/);
    return match ? match[1] : "OTHER";
  };

  // 获取所有唯一的车辆类型
  const vehicleTypes = ["ALL", ...Array.from(new Set(vehicles.map(v => extractVehiclePrefix(v.name)))).sort()];

  // 根据筛选条件过滤车辆
  const filteredVehicles = vehicleTypeFilter === "ALL" 
    ? vehicles 
    : vehicles.filter(v => extractVehiclePrefix(v.name) === vehicleTypeFilter);

  // 获取司机已分配的车辆
  const getDriverVehicles = (driverId: string) => {
    const driverAssignments = assignments.filter(a => a.driver_id === driverId);
    return vehicles.filter(v => driverAssignments.some(a => a.vehicle_id === v.id));
  };

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
      const result = await fetchSamsaraVehicles();
      
      if (!result.success) {
        throw new Error(result.error || 'API 返回失败');
      }
      
      const samsaraVehicles = result.data || [];
      
      // 1. 深度清理：按顺序删除受约束的数据
      console.log("🔄 正在清理旧的派遣数据...");
      
      // 先删步骤 (依赖于 assignments)
      await supabase.from("job_steps").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      
      // 再删派遣记录 (依赖于 vehicles)
      await supabase.from("dispatch_assignments").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      
      // 最后删除所有车辆
      const { error: deleteError } = await supabase.from("vehicles").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      
      if (deleteError) {
        console.error("❌ 删除旧车辆失败:", deleteError);
        throw new Error(`清除旧数据失败: ${deleteError.message}`);
      }
      
      console.log("✅ 已完成深度清理");

      // 2. 准备新数据，并进行内部分组去重（防止 Samsara 返回重复的车牌名）
      const uniqueInsertsMap = new Map();
      
      samsaraVehicles.forEach((v: any) => {
        if (!v.name) return;
        const plate = v.name.toUpperCase();
        if (!uniqueInsertsMap.has(plate)) {
          uniqueInsertsMap.set(plate, {
            name: v.name,
            type: "MACK" as const,
            plate: plate,
            samsara_id: v.id,
            max_bin_size: "40",
            is_active: true
          });
        }
      });
      
      const inserts = Array.from(uniqueInsertsMap.values());
      
      // 3. 插入所有同步到的车辆
      if (inserts.length > 0) {
        const { error: insertError } = await supabase.from("vehicles").insert(inserts);
        if (insertError) throw insertError;
      }
      
      return { total: samsaraVehicles.length, added: inserts.length };
    },
    onSuccess: (result) => {
      toast.success(`同步成功！共 ${result.total} 辆车，新增 ${result.added} 辆`);
      qc.invalidateQueries({ queryKey: ["vehicles-all"] });
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
            <h2 className="font-semibold">司机 ({drivers.length})</h2>
            <Button size="sm" onClick={() => setAddingDriver(true)}><Plus className="h-4 w-4 mr-1" /> 添加司机</Button>
          </div>
          <div className="space-y-2">
            {drivers.map((d) => (
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
                {/* 显示已分配的车辆 */}
                <div className="ml-13 space-y-1">
                  {getDriverVehicles(d.id).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {getDriverVehicles(d.id).map(v => (
                        <Badge key={v.id} variant="outline" className="text-xs">
                          {v.name}
                        </Badge>
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
          
          {/* 车辆类型筛选器 */}
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
      if (!email || !password) throw new Error("邮箱和密码必填，用于开通登录账号");
      // 获取当前 session token，通过 Authorization header 传给 server function
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("未登录，请重新登录后操作");
      return await createStaffOrDriverUser({
        data: {
          name: name.trim(),
          email: email.trim(),
          password: password,
          phone: phone || undefined,
          role: "driver",
          accessToken: token // 将 token 放在这里传
        }
      });
    },
    onSuccess: () => { 
      toast.success("已添加司机并开通登录账号"); 
      qc.invalidateQueries({ queryKey: ["drivers-all"] }); 
      onClose(); 
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>添加司机并开通账号</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>姓名</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：张三" /></div>
          <div><Label>电话</Label><Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="例如：(123) 456-7890" /></div>
          <div><Label>登录邮箱</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="driver@kennedy.test" /></div>
          <div><Label>初始密码 (至少6位)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="设置司机的登录密码" /></div>
          <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
            提示：在这里添加司机会同步在系统后台创建登录账号，司机可使用此邮箱和密码登录 PWA 端。
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => add.mutate()} disabled={!name.trim() || !email || password.length < 6 || add.isPending}>
            {add.isPending ? "创建中..." : "确认添加并开通"}
          </Button>
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
    onSuccess: () => { toast.success("已保存司机信息"); qc.invalidateQueries({ queryKey: ["drivers-all"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>编辑司机: {driver.name}</DialogTitle></DialogHeader>
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
      const { error } = await supabase.from("vehicles").insert({
        name: name.trim(), type, plate: plate.trim(),
        samsara_id: samsara || null,
        max_bin_size: type === "HINO" ? "20" : "40",
      });
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
          <div><Label>车辆名</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MACK-4" /></div>
          <div>
            <Label>车型</Label>
            <Select value={type} onValueChange={(v) => setType(v as "HINO" | "MACK")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HINO">HINO (最大 20yd)</SelectItem>
                <SelectItem value="MACK">MACK (最大 40yd)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>车牌</Label><Input value={plate} onChange={(e) => setPlate(e.target.value)} /></div>
          <div><Label>Samsara ID(可选)</Label><Input value={samsara} onChange={(e) => setSamsara(e.target.value)} /></div>
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
      const { error } = await supabase.from("vehicles").update({
        name: name.trim(), type, plate: plate.trim(),
        samsara_id: samsara || null,
        max_bin_size: type === "HINO" ? "20" : "40",
      }).eq("id", vehicle.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("已保存车辆信息"); qc.invalidateQueries({ queryKey: ["vehicles-all"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>编辑车辆: {vehicle.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>车辆名</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>车型</Label>
            <Select value={type} onValueChange={(v) => setType(v as "HINO" | "MACK")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HINO">HINO (最大 20yd)</SelectItem>
                <SelectItem value="MACK">MACK (最大 40yd)</SelectItem>
              </SelectContent>
            </Select>
          </div>
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

function AssignVehicleDialog({ 
  driver, 
  vehicles, 
  assignments,
  onClose 
}: { 
  driver: Driver; 
  vehicles: Vehicle[];
  assignments: DriverVehicleAssignment[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  // 提取车辆类型前缀
  const extractVehiclePrefix = (name: string): string => {
    const match = name.match(/^([A-Z]+)#/);
    return match ? match[1] : "OTHER";
  };

  // 获取所有车辆类型
  const vehicleTypes = Array.from(new Set(vehicles.map(v => extractVehiclePrefix(v.name)))).sort();

  // 根据选中的类型过滤车辆
  const filteredVehicles = selectedType 
    ? vehicles.filter(v => extractVehiclePrefix(v.name) === selectedType)
    : [];

  // 获取司机已分配的车辆ID
  const assignedVehicleIds = assignments
    .filter(a => a.driver_id === driver.id)
    .map(a => a.vehicle_id);

  // 分配车辆
  const assignVehicle = useMutation({
    mutationFn: async () => {
      if (!selectedVehicleId) throw new Error("请选择车辆");
      
      // 检查是否已分配
      if (assignedVehicleIds.includes(selectedVehicleId)) {
        throw new Error("该车辆已分配给此司机");
      }

      // 先删除该司机的所有旧分配（确保一个司机只有一辆车）
      const { error: deleteError } = await supabase
        .from("driver_vehicle_assignments")
        .delete()
        .eq("driver_id", driver.id);
      
      if (deleteError) throw deleteError;

      // 再插入新的分配
      const { error } = await supabase.from("driver_vehicle_assignments").insert({
        driver_id: driver.id,
        vehicle_id: selectedVehicleId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("已分配车辆");
      qc.invalidateQueries({ queryKey: ["driver-vehicle-assignments"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // 取消分配车辆
  const unassignVehicle = useMutation({
    mutationFn: async (vehicleId: string) => {
      const assignment = assignments.find(
        a => a.driver_id === driver.id && a.vehicle_id === vehicleId
      );
      if (!assignment) throw new Error("未找到分配记录");

      const { error } = await supabase
        .from("driver_vehicle_assignments")
        .delete()
        .eq("id", assignment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("已取消分配");
      qc.invalidateQueries({ queryKey: ["driver-vehicle-assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>为 {driver.name} 分配车辆</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 已分配的车辆 */}
          <div>
            <Label className="mb-2 block">已分配的车辆</Label>
            {assignedVehicleIds.length > 0 ? (
              <div className="space-y-2">
                {vehicles
                  .filter(v => assignedVehicleIds.includes(v.id))
                  .map(v => (
                    <div key={v.id} className="flex items-center justify-between bg-muted p-2 rounded">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{extractVehiclePrefix(v.name)}</Badge>
                        <span className="font-medium">{v.name}</span>
                        <span className="text-xs text-muted-foreground">{v.plate}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm(`确定取消分配 ${v.name} 吗？`)) {
                            unassignVehicle.mutate(v.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
                暂无分配的车辆
              </div>
            )}
          </div>

          {/* 选择车辆类型 */}
          <div>
            <Label className="mb-2 block">1. 选择车辆类型</Label>
            <div className="flex flex-wrap gap-2">
              {vehicleTypes.map(type => (
                <Button
                  key={type}
                  size="sm"
                  variant={selectedType === type ? "default" : "outline"}
                  onClick={() => {
                    setSelectedType(type);
                    setSelectedVehicleId(null);
                  }}
                >
                  {type} ({vehicles.filter(v => extractVehiclePrefix(v.name) === type).length})
                </Button>
              ))}
            </div>
          </div>

          {/* 选择具体车辆 */}
          {selectedType && (
            <div>
              <Label className="mb-2 block">2. 选择车辆</Label>
              <div className="max-h-60 overflow-y-auto space-y-2 border rounded p-2">
                {filteredVehicles.map(v => {
                  const isAssigned = assignedVehicleIds.includes(v.id);
                  return (
                    <div
                      key={v.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded cursor-pointer hover:bg-muted",
                        selectedVehicleId === v.id && "bg-primary/10 border border-primary",
                        isAssigned && "opacity-50"
                      )}
                      onClick={() => !isAssigned && setSelectedVehicleId(v.id)}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{v.type}</Badge>
                        <span className="font-medium">{v.name}</span>
                        <span className="text-xs text-muted-foreground">车牌: {v.plate}</span>
                      </div>
                      {isAssigned && (
                        <Badge variant="secondary" className="text-xs">已分配</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>关闭</Button>
          <Button 
            onClick={() => assignVehicle.mutate()} 
            disabled={!selectedVehicleId || assignVehicle.isPending}
          >
            {assignVehicle.isPending ? "分配中..." : "确认分配"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
