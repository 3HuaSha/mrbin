import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Power, Pencil, Trash2 } from "lucide-react";
import { formatPhone } from "@/lib/business";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Driver = { id: string; name: string; phone: string | null; email: string | null; is_active: boolean };
type Vehicle = { id: string; name: string; type: "HINO" | "MACK"; plate: string; samsara_id: string | null; max_bin_size: string | null; is_active: boolean };

export function FleetPage() {
  const qc = useQueryClient();
  const [addingDriver, setAddingDriver] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

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
              <div key={d.id} className={cn("bg-card border rounded-lg p-3 flex items-center gap-3", !d.is_active && "opacity-50")}>
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
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">车辆 ({vehicles.length})</h2>
            <Button size="sm" onClick={() => setAddingVehicle(true)}><Plus className="h-4 w-4 mr-1" /> 添加车辆</Button>
          </div>
          <div className="space-y-2">
            {vehicles.map((v) => (
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
    </div>
  );
}

function AddDriverDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").insert({ name: name.trim(), phone: phone || null, email: email || null, role: "driver" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("已添加司机"); qc.invalidateQueries({ queryKey: ["drivers-all"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>添加司机</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>姓名</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>电话</Label><Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} /></div>
          <div><Label>邮箱(用于登录关联,可选)</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="driver@kennedy.test" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => add.mutate()} disabled={!name.trim() || add.isPending}>添加</Button>
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
