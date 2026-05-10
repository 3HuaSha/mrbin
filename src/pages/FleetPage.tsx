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
import { getActiveVehicleIds } from "@/lib/vehicle-status";

type Driver = { id: string; name: string; phone: string | null; email: string | null; is_active: boolean };
type Vehicle = { id: string; name: string; type: "HINO" | "MACK"; plate: string; samsara_id: string | null; max_bin_size: string | null; is_active: boolean };
type DriverVehicleAssignment = { id: string; driver_id: string; vehicle_id: string; assigned_at: string; notes: string | null };
type SamsaraDriver = { id: string; name: string; phone: string | null; driver_id: string | null; last_seen_at: string | null };

export function FleetPage() {
  const qc = useQueryClient();
  const [addingDriver, setAddingDriver] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>("ALL");
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState<"ALL" | "ACTIVE">("ALL");
  const [driverFilter, setDriverFilter] = useState<"ALL" | "ASSIGNED">("ASSIGNED");
  const [assigningDriver, setAssigningDriver] = useState<Driver | null>(null);
  const [bindingSamsara, setBindingSamsara] = useState<Driver | null>(null);
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

  const { data: samsaraDrivers = [] } = useQuery({
    queryKey: ["samsara-drivers"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("samsara_drivers").select("*").order("name");
      if (error) throw error;
      return data as SamsaraDriver[];
    },
  });

  const getBoundSamsaraDrivers = (driverId: string) => samsaraDrivers.filter(sd => sd.driver_id === driverId);
  const unboundSamsaraDrivers = samsaraDrivers.filter(sd => !sd.driver_id);

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

  const filteredVehicles = vehicles.filter(v => {
    // 类型筛选
    if (vehicleTypeFilter !== "ALL" && extractVehiclePrefix(v.name) !== vehicleTypeFilter) {
      return false;
    }
    // 状态筛选（活跃车辆 = 引擎正在运行的车辆）
    if (vehicleStatusFilter === "ACTIVE") {
      return v.is_active;
    }
    return true;
  });

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
      
      const { vehicles: sVehicles = [], drivers: sDrivers = [], assignments: sAssigns = [], vehicleStats: sStats = [], locations: sLocs = [], debug } = result as any;
      (window as any).__SAMSARA_DEBUG__ = { sVehicles, sDrivers, sAssigns, sStats, sLocs, debug };

      // 1. 同步车辆 (重建 vehicles 表)
      await supabase.from("job_steps").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      await supabase.from("dispatch_assignments").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      await supabase.from("vehicles").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);

      // 把 locations 的 GPS 时间戳合并到 stats 作为心跳源
      sLocs.forEach((loc: any) => {
        if (!loc.id) return;
        const stat = sStats.find((s: any) => s.id === loc.id);
        if (!stat) return;
        const locTime = loc.time || loc.location?.time || loc.gps?.time;
        const lat = loc.latitude ?? loc.location?.latitude ?? loc.gps?.latitude;
        const lng = loc.longitude ?? loc.location?.longitude ?? loc.gps?.longitude;
        if (locTime) {
          const existingTime = stat.gps?.time;
          if (!existingTime || new Date(locTime).getTime() > new Date(existingTime).getTime()) {
            stat.gps = { ...(stat.gps || {}), time: locTime, latitude: lat, longitude: lng };
          }
        }
      });
      const activeVehicleIds = getActiveVehicleIds(sStats);

      const vehicleInserts = sVehicles.filter((v: any) => v.name).map((v: any) => {
        const name = v.name.toUpperCase().trim();
        let type: "HINO" | "MACK" = "MACK";
        let size = "40";
        if (name.includes("HINO")) {
          type = "HINO";
          size = "20";
        } else if (name.includes("MACK")) {
          type = "MACK";
          size = "40";
        }
        return {
          name: v.name,
          type,
          plate: v.name,
          samsara_id: v.id,
          max_bin_size: size,
          is_active: activeVehicleIds.has(v.id),
        };
      });

      const { data: insertedVehicles, error: vError } = await supabase.from("vehicles").insert(vehicleInserts).select();
      if (vError) {
        console.error('[Samsara同步] vehicles insert 失败:', vError, vehicleInserts);
        throw vError;
      }
      const allVehicles = insertedVehicles || [];

      // 2. 同步 samsara_drivers (保留现有 driver_id 绑定关系)
      // 查出现有的绑定
      const { data: existingSamsaraDrivers } = await (supabase.from as any)("samsara_drivers").select("id, driver_id");
      const existingBindings = new Map<string, string | null>();
      (existingSamsaraDrivers || []).forEach((sd: any) => existingBindings.set(sd.id, sd.driver_id));

      const nowIso = new Date().toISOString();
      const samsaraDriverRows = sDrivers.filter((sd: any) => sd.id && sd.name).map((sd: any) => ({
        id: sd.id,
        name: sd.name,
        phone: sd.phone || null,
        driver_id: existingBindings.get(sd.id) ?? null,  // 保留原有绑定
        last_seen_at: nowIso,
        is_active_in_samsara: !sd.deactivatedAtTime,
        updated_at: nowIso,
      }));

      // upsert 到 samsara_drivers
      if (samsaraDriverRows.length > 0) {
        const { error: sdErr } = await (supabase.from as any)("samsara_drivers").upsert(samsaraDriverRows, { onConflict: "id" });
        if (sdErr) {
          console.error('[Samsara同步] samsara_drivers upsert 失败:', sdErr);
          throw sdErr;
        }
      }

      // 3. 计算活跃状态 + driver_vehicle_assignments
      await supabase.from("driver_vehicle_assignments").delete().neq("id", "00000000-0000-0000-0000-000000000000" as any);
      await supabase.from("profiles").update({ is_active: false }).eq("role", "driver");

      // 找出每辆活跃车的 Samsara 司机 ID
      // 来源 1: stats 的 OBD 司机
      // 来源 2: 实时分配接口
      // 来源 3: 车辆静态分配
      const activeSamsaraIds = new Set<string>();
      const samsaraIdToVehicleId = new Map<string, string>(); // samsaraDriverId -> vehicleId (本地 UUID)

      const vehicleBySamsaraId = new Map<string, any>();
      allVehicles.forEach((v: any) => { if (v.samsara_id) vehicleBySamsaraId.set(v.samsara_id, v); });

      sStats.forEach((stat: any) => {
        if (activeVehicleIds.has(stat.id) && stat.obdDriver?.driver?.id) {
          const sdId = stat.obdDriver.driver.id;
          activeSamsaraIds.add(sdId);
          const vehicle = vehicleBySamsaraId.get(stat.id);
          if (vehicle && !samsaraIdToVehicleId.has(sdId)) samsaraIdToVehicleId.set(sdId, vehicle.id);
        }
      });

      sAssigns.forEach((a: any) => {
        if (a.vehicle?.id && activeVehicleIds.has(a.vehicle.id) && a.driver?.id) {
          activeSamsaraIds.add(a.driver.id);
          const vehicle = vehicleBySamsaraId.get(a.vehicle.id);
          if (vehicle && !samsaraIdToVehicleId.has(a.driver.id)) samsaraIdToVehicleId.set(a.driver.id, vehicle.id);
        }
      });

      sDrivers.forEach((sd: any) => {
        const vehicleRef = sd.currentVehicle || sd.staticAssignedVehicle;
        if (vehicleRef?.id && activeVehicleIds.has(vehicleRef.id)) {
          activeSamsaraIds.add(sd.id);
          const vehicle = vehicleBySamsaraId.get(vehicleRef.id);
          if (vehicle && !samsaraIdToVehicleId.has(sd.id)) samsaraIdToVehicleId.set(sd.id, vehicle.id);
        }
      });

      sVehicles.forEach((sv: any) => {
        if (activeVehicleIds.has(sv.id) && sv.staticAssignedDriver?.id) {
          const sdId = sv.staticAssignedDriver.id;
          activeSamsaraIds.add(sdId);
          const vehicle = vehicleBySamsaraId.get(sv.id);
          if (vehicle && !samsaraIdToVehicleId.has(sdId)) samsaraIdToVehicleId.set(sdId, vehicle.id);
        }
      });

      // 查出当前所有绑定 (上面刚 upsert 过的)
      const { data: allBindings } = await (supabase.from as any)("samsara_drivers").select("id, driver_id");
      const bindingsMap = new Map<string, string>();
      (allBindings || []).forEach((sd: any) => {
        if (sd.driver_id) bindingsMap.set(sd.id, sd.driver_id);
      });

      // 激活绑定的本地司机, 并创建 driver_vehicle_assignments
      const activeLocalDriverIds = new Set<string>();
      const assignmentInserts: Array<{ driver_id: string; vehicle_id: string }> = [];
      const analysisData: Array<{ name: string; ref: string; source: string; matched: boolean }> = [];

      for (const sdId of activeSamsaraIds) {
        const localDriverId = bindingsMap.get(sdId);
        const sd = sDrivers.find((d: any) => d.id === sdId);
        const vehicleId = samsaraIdToVehicleId.get(sdId);
        const vehicle = vehicleId ? allVehicles.find((v: any) => v.id === vehicleId) : null;

        if (localDriverId) {
          activeLocalDriverIds.add(localDriverId);
          if (vehicle && !assignmentInserts.some(a => a.driver_id === localDriverId)) {
            assignmentInserts.push({ driver_id: localDriverId, vehicle_id: vehicle.id });
            analysisData.push({ name: sd?.name || sdId, ref: vehicle.name, source: '已绑定', matched: true });
          }
        } else {
          // 未绑定的 Samsara 司机在开活跃车
          analysisData.push({ name: sd?.name || sdId, ref: vehicle?.name || '-', source: '未绑定本地司机', matched: false });
        }
      }

      // 激活对应本地司机
      if (activeLocalDriverIds.size > 0) {
        await supabase.from("profiles").update({ is_active: true }).in("id", Array.from(activeLocalDriverIds));
      }

      if (assignmentInserts.length > 0) {
        await supabase.from("driver_vehicle_assignments").insert(assignmentInserts);
      }

      setSyncAnalysis({
        totalDrivers: sDrivers.length,
        driversWithRefs: analysisData,
        debugStatuses: debug
      } as any);

      return { vehicles: allVehicles.length, assignments: assignmentInserts.length, drivers: samsaraDriverRows.length };
    },
    onSuccess: (res) => {
      toast.success(`同步完成！车辆: ${res.vehicles}, Samsara 司机: ${res.drivers}, 活跃分配: ${res.assignments}`);
      qc.invalidateQueries({ queryKey: ["vehicles-all"] });
      qc.invalidateQueries({ queryKey: ["drivers-all"] });
      qc.invalidateQueries({ queryKey: ["driver-vehicle-assignments"] });
      qc.invalidateQueries({ queryKey: ["samsara-drivers"] });
    },
    onError: (e: Error) => {
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
          {unboundSamsaraDrivers.length > 0 && (
            <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              ⚠️ 有 {unboundSamsaraDrivers.length} 个 Samsara 账号未绑定到任何本地司机：
              <span className="font-mono ml-1">
                {unboundSamsaraDrivers.slice(0, 5).map(sd => sd.name).join(", ")}
                {unboundSamsaraDrivers.length > 5 && ` 等`}
              </span>
            </div>
          )}
          <div className="space-y-2">
            {filteredDrivers.map((d) => {
              const bound = getBoundSamsaraDrivers(d.id);
              return (
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
                  {bound.length > 0 && (
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-xs text-muted-foreground">Samsara:</span>
                      {bound.map(sd => (
                        <Badge key={sd.id} variant="secondary" className="text-[10px]">{sd.name}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="mt-1" onClick={() => setAssigningDriver(d)}>
                      <Plus className="h-3 w-3 mr-1" /> 分配车辆
                    </Button>
                    <Button size="sm" variant="outline" className="mt-1" onClick={() => setBindingSamsara(d)}>
                      <Plus className="h-3 w-3 mr-1" /> Samsara 账号 ({bound.length})
                    </Button>
                  </div>
                </div>
              </div>
              );
            })}
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
          <div className="mb-3 flex gap-2">
            <Button
              size="sm"
              variant={vehicleStatusFilter === "ALL" ? "default" : "outline"}
              onClick={() => setVehicleStatusFilter("ALL")}
            >
              全部车辆
            </Button>
            <Button
              size="sm"
              variant={vehicleStatusFilter === "ACTIVE" ? "default" : "outline"}
              onClick={() => setVehicleStatusFilter("ACTIVE")}
            >
              活跃车辆 ({vehicles.filter(v => v.is_active).length})
            </Button>
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
      {bindingSamsara && (
        <BindSamsaraDialog
          driver={bindingSamsara}
          samsaraDrivers={samsaraDrivers}
          onClose={() => setBindingSamsara(null)}
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
          <div className="flex gap-2 text-[10px]">
            {analysis.debugStatuses && Object.entries(analysis.debugStatuses).map(([k, v]: any) => (
              <Badge key={k} variant={v === 200 ? "outline" : "destructive"}>{k}: {v}</Badge>
            ))}
          </div>
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

function BindSamsaraDialog({ driver, samsaraDrivers, onClose }: { driver: Driver; samsaraDrivers: SamsaraDriver[]; onClose: () => void; }) {
  const qc = useQueryClient();
  const bound = samsaraDrivers.filter(sd => sd.driver_id === driver.id);
  const available = samsaraDrivers.filter(sd => !sd.driver_id || sd.driver_id === driver.id);

  const toggleBinding = useMutation({
    mutationFn: async ({ samsaraDriverId, bind }: { samsaraDriverId: string; bind: boolean }) => {
      const { error } = await (supabase.from as any)("samsara_drivers")
        .update({ driver_id: bind ? driver.id : null, updated_at: new Date().toISOString() })
        .eq("id", samsaraDriverId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["samsara-drivers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>绑定 Samsara 账号 - {driver.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-xs text-muted-foreground">
            一个本地司机可绑定多个 Samsara 账号（处理 Dao(1) / Dao(2) 这类重复账号）
          </div>
          {available.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              暂无可用的 Samsara 账号，先点"从 Samsara 同步"拉取账号列表
            </div>
          ) : (
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {available.map(sd => {
                const isBound = sd.driver_id === driver.id;
                return (
                  <div key={sd.id} className={cn(
                    "flex items-center justify-between border rounded px-3 py-2",
                    isBound && "bg-primary/5 border-primary"
                  )}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{sd.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">ID: {sd.id}</div>
                    </div>
                    <Button
                      size="sm"
                      variant={isBound ? "default" : "outline"}
                      onClick={() => toggleBinding.mutate({ samsaraDriverId: sd.id, bind: !isBound })}
                      disabled={toggleBinding.isPending}
                    >
                      {isBound ? "已绑定" : "绑定"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          {bound.length > 0 && (
            <div className="text-xs text-muted-foreground pt-2 border-t">
              已绑定 {bound.length} 个：{bound.map(sd => sd.name).join(", ")}
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
