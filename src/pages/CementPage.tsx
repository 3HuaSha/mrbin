import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, ClipboardPlus, DollarSign, Package, Search, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CementStatus = "pending" | "scheduled" | "in_progress" | "delivered" | "completed" | "cancelled";
type MaterialStatus = "pending" | "ordered" | "scheduled" | "delivered" | "completed" | "cancelled";

type CementOrder = {
  id: string;
  demand_date: string;
  demand_time: string | null;
  order_date: string | null;
  order_number: string | null;
  company: string;
  tel: string | null;
  mpa: string | null;
  air: string | null;
  pump_truck: boolean;
  order_qty_cbm: number | null;
  note: string | null;
  delivery_address: string;
  driver_name: string | null;
  vehicle_name: string | null;
  schedule_sequence: number | null;
  arrival_time: string | null;
  finish_time: string | null;
  actual_usage_cbm: number | null;
  delivered_qty_cbm: number | null;
  receivable_amount: number | null;
  driver_collected: number | null;
  paid_amount: number | null;
  invoice_number: string | null;
  print_status: string | null;
  status: CementStatus;
};

type CementMaterialOrder = {
  id: string;
  order_date: string | null;
  order_number: string | null;
  company: string;
  contact: string | null;
  tel: string | null;
  material: string;
  order_qty: number | null;
  order_unit: string | null;
  demand_date: string;
  demand_time: string | null;
  note: string | null;
  driver_name: string | null;
  delivered_qty: number | null;
  deliver_unit: string | null;
  delivery_address: string;
  invoice_number: string | null;
  is_completed: boolean;
  status: MaterialStatus;
};

type CementMaterialInventory = {
  material: CementMaterialName;
  current_qty: number;
  unit: string;
};

type CementVehicle = {
  id: string;
  name: string;
  plate: string | null;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const CEMENT_MATERIAL_DEFAULTS = {
  "Concrete Sand": {
    company: "Brock",
    contact: "JOE",
    tel: "(416) 891-7263",
    orderUnit: "LOAD",
  },
  HL6: {
    company: "Brock",
    contact: "JOE",
    tel: "(416) 891-7263",
    orderUnit: "LOAD",
  },
  Cement: {
    company: "STUBBES (St Mary)",
    contact: "MATT",
    tel: "(519) 536-3018",
    orderUnit: "TON",
  },
} as const;

type CementMaterialName = keyof typeof CEMENT_MATERIAL_DEFAULTS;

const CEMENT_MATERIAL_DELIVER_UNIT = "TON";
const CEMENT_MATERIAL_DELIVERY_ADDRESS = "3445 KENNEDY RD";

const MATERIAL_USAGE_PER_CBM: Record<CementMaterialName, number> = {
  Cement: 0.35,
  "Concrete Sand": 0.73,
  HL6: 1.1,
};

const MATERIAL_ORDER: CementMaterialName[] = ["Cement", "Concrete Sand", "HL6"];

const cementStatusMeta: Record<CementStatus, { label: string; className: string }> = {
  pending: { label: "待安排", className: "bg-slate-100 text-slate-700 border-slate-200" },
  scheduled: { label: "已排班", className: "bg-blue-100 text-blue-700 border-blue-200" },
  in_progress: { label: "进行中", className: "bg-amber-100 text-amber-800 border-amber-200" },
  delivered: { label: "已送达", className: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  completed: { label: "完成", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled: { label: "取消", className: "bg-rose-100 text-rose-700 border-rose-200" },
};

const materialStatusMeta: Record<MaterialStatus, { label: string; className: string }> = {
  pending: { label: "待订", className: "bg-slate-100 text-slate-700 border-slate-200" },
  ordered: { label: "已订", className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  scheduled: { label: "已排送", className: "bg-blue-100 text-blue-700 border-blue-200" },
  delivered: { label: "已送达", className: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  completed: { label: "完成", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelled: { label: "取消", className: "bg-rose-100 text-rose-700 border-rose-200" },
};

const money = (value: number | null | undefined) =>
  value == null ? "-" : `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const qty = (value: number | null | undefined, unit: string) =>
  value == null ? "-" : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;

function toNumber(value: FormDataEntryValue | null) {
  const s = String(value ?? "").trim();
  return s === "" ? null : Number(s);
}

function toText(value: FormDataEntryValue | null) {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

export function CementPage() {
  const qc = useQueryClient();
  const [from, setFrom] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [cementOpen, setCementOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);

  const { data: cementOrders = [], isLoading: cementLoading } = useQuery({
    queryKey: ["cement-orders", from],
    queryFn: async () => {
      let q = (supabase as any)
        .from("cement_orders")
        .select("*")
        .gte("demand_date", from)
        .neq("status", "cancelled")
        .order("demand_date", { ascending: true })
        .order("schedule_sequence", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CementOrder[];
    },
  });

  const { data: materialOrders = [], isLoading: materialLoading } = useQuery({
    queryKey: ["cement-material-orders", from],
    queryFn: async () => {
      let q = (supabase as any)
        .from("cement_material_orders")
        .select("*")
        .gte("demand_date", from)
        .order("demand_date", { ascending: true })
        .order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CementMaterialOrder[];
    },
  });

  const { data: forecastCementOrders = [] } = useQuery({
    queryKey: ["cement-forecast-orders"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cement_orders")
        .select("id, demand_date, order_qty_cbm, status")
        .gte("demand_date", todayISO())
        .not("status", "in", '("delivered","completed","cancelled")');
      if (error) throw error;
      return (data ?? []) as Pick<CementOrder, "id" | "demand_date" | "order_qty_cbm" | "status">[];
    },
  });

  const { data: forecastMaterialOrders = [] } = useQuery({
    queryKey: ["cement-material-forecast-orders"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cement_material_orders")
        .select("id, material, order_qty, status")
        .gte("demand_date", todayISO())
        .not("status", "in", '("delivered","completed","cancelled")');
      if (error) throw error;
      return (data ?? []) as Pick<CementMaterialOrder, "id" | "material" | "order_qty" | "status">[];
    },
  });

  const { data: deliveredMaterialOrders = [] } = useQuery({
    queryKey: ["cement-material-delivered-orders", from],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cement_material_orders")
        .select("id, material, order_qty, delivered_qty, status, is_completed")
        .gte("demand_date", from)
        .or("status.in.(delivered,completed),is_completed.eq.true");
      if (error) throw error;
      return (data ?? []) as Pick<CementMaterialOrder, "id" | "material" | "order_qty" | "delivered_qty" | "status" | "is_completed">[];
    },
  });

  const { data: materialInventory = [] } = useQuery({
    queryKey: ["cement-material-inventory"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cement_material_inventory")
        .select("material, current_qty, unit");
      if (error) throw error;
      return (data ?? []) as CementMaterialInventory[];
    },
  });

  const { data: cementVehicles = [] } = useQuery({
    queryKey: ["cement-proall-vehicles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vehicles")
        .select("id, name, plate")
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as CementVehicle[]).filter((vehicle) => {
        const name = (vehicle.name ?? "").toUpperCase();
        const plate = (vehicle.plate ?? "").toUpperCase();
        return name.startsWith("PROALL") || plate.startsWith("PROALL");
      });
    },
  });

  const filteredCement = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return cementOrders;
    return cementOrders.filter((o) =>
      [o.order_number, o.company, o.tel, o.delivery_address, o.driver_name, o.vehicle_name, o.invoice_number]
        .some((v) => String(v ?? "").toLowerCase().includes(s)),
    );
  }, [cementOrders, search]);

  const filteredMaterials = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return materialOrders;
    return materialOrders.filter((o) =>
      [o.order_number, o.company, o.contact, o.tel, o.material, o.delivery_address, o.driver_name, o.invoice_number]
        .some((v) => String(v ?? "").toLowerCase().includes(s)),
    );
  }, [materialOrders, search]);

  const totals = useMemo(() => {
    const concreteQty = filteredCement.reduce((sum, o) => sum + Number(o.order_qty_cbm ?? 0), 0);
    const deliveredQty = filteredCement.reduce((sum, o) => sum + Number(o.delivered_qty_cbm ?? 0), 0);
    const receivable = filteredCement.reduce((sum, o) => sum + Number(o.receivable_amount ?? 0), 0);
    const openConcrete = filteredCement.filter((o) => !["completed", "cancelled"].includes(o.status)).length;
    const openMaterials = filteredMaterials.filter((o) => !["completed", "cancelled"].includes(o.status)).length;
    return { concreteQty, deliveredQty, receivable, openConcrete, openMaterials };
  }, [filteredCement, filteredMaterials]);

  const materialForecast = useMemo(() => {
    const totalCbm = forecastCementOrders.reduce((sum, o) => sum + Number(o.order_qty_cbm ?? 0), 0);
    return MATERIAL_ORDER.map((material) => {
      const inventory = materialInventory.find((row) => row.material === material);
      const baseQty = Number(inventory?.current_qty ?? 0);
      const deliveredQty = deliveredMaterialOrders
        .filter((o) => o.material === material)
        .reduce((sum, o) => sum + Number(o.delivered_qty ?? o.order_qty ?? 0), 0);
      const currentQty = baseQty + deliveredQty;
      const orderedQty = forecastMaterialOrders
        .filter((o) => o.material === material)
        .reduce((sum, o) => sum + Number(o.order_qty ?? 0), 0);
      const demandQty = totalCbm * MATERIAL_USAGE_PER_CBM[material];
      const suggestedQty = Math.max(0, demandQty - currentQty - orderedQty);
      return {
        material,
        totalCbm,
        demandQty,
        currentQty,
        deliveredQty,
        orderedQty,
        suggestedQty,
        unit: inventory?.unit ?? "TON",
      };
    });
  }, [forecastCementOrders, forecastMaterialOrders, materialInventory, deliveredMaterialOrders]);

  const updateInventory = useMutation({
    mutationFn: async ({ material, currentQty }: { material: CementMaterialName; currentQty: number }) => {
      const { error } = await (supabase as any)
        .from("cement_material_inventory")
        .upsert({ material, current_qty: currentQty, unit: "TON" }, { onConflict: "material" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cement-material-inventory"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const createCement = useMutation({
    mutationFn: async (form: FormData) => {
      const payload = {
        demand_date: String(form.get("demand_date") || todayISO()),
        demand_time: toText(form.get("demand_time")),
        order_date: toText(form.get("order_date")),
        order_number: toText(form.get("order_number")),
        company: String(form.get("company") || "").trim(),
        tel: toText(form.get("tel")),
        mpa: toText(form.get("mpa")),
        air: toText(form.get("air")),
        pump_truck: form.get("pump_truck") === "yes",
        order_qty_cbm: toNumber(form.get("order_qty_cbm")),
        note: toText(form.get("note")),
        delivery_address: String(form.get("delivery_address") || "").trim(),
        status: "pending",
      };
      if (!payload.company || !payload.delivery_address) throw new Error("公司和送货地址必填");
      const { error } = await (supabase as any).from("cement_orders").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("水泥订单已新增");
      setCementOpen(false);
      qc.invalidateQueries({ queryKey: ["cement-orders"] });
      qc.invalidateQueries({ queryKey: ["cement-forecast-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMaterial = useMutation({
    mutationFn: async (form: FormData) => {
      const payload = {
        order_date: toText(form.get("order_date")),
        order_number: toText(form.get("order_number")),
        company: String(form.get("company") || "").trim(),
        contact: toText(form.get("contact")),
        tel: toText(form.get("tel")),
        material: String(form.get("material") || "").trim(),
        order_qty: toNumber(form.get("order_qty")),
        order_unit: toText(form.get("order_unit")) ?? "EA",
        deliver_unit: CEMENT_MATERIAL_DELIVER_UNIT,
        demand_date: String(form.get("demand_date") || todayISO()),
        demand_time: toText(form.get("demand_time")),
        note: toText(form.get("note")),
        delivery_address: String(form.get("delivery_address") || "").trim(),
        status: "pending",
      };
      if (!payload.company || !payload.material || !payload.delivery_address) {
        throw new Error("公司、材料和送货地址必填");
      }
      const { error } = await (supabase as any).from("cement_material_orders").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("材料订单已新增");
      setMaterialOpen(false);
      qc.invalidateQueries({ queryKey: ["cement-material-orders"] });
      qc.invalidateQueries({ queryKey: ["cement-material-forecast-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCement = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CementOrder> }) => {
      const { error } = await (supabase as any).from("cement_orders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cement-orders"] });
      qc.invalidateQueries({ queryKey: ["cement-forecast-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMaterial = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CementMaterialOrder> }) => {
      const { error } = await (supabase as any).from("cement_material_orders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cement-material-orders"] });
      qc.invalidateQueries({ queryKey: ["cement-material-forecast-orders"] });
      qc.invalidateQueries({ queryKey: ["cement-material-delivered-orders"] });
      qc.invalidateQueries({ queryKey: ["cement-material-inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-muted/20 p-4">
      <div className="mb-3 flex justify-end gap-2">
          <Dialog open={cementOpen} onOpenChange={setCementOpen}>
            <DialogTrigger asChild>
              <Button><ClipboardPlus className="mr-2 h-4 w-4" />新水泥订单</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>新增水泥订单</DialogTitle></DialogHeader>
              <CementOrderForm onSubmit={(form) => createCement.mutate(form)} pending={createCement.isPending} />
            </DialogContent>
          </Dialog>
          <Dialog open={materialOpen} onOpenChange={setMaterialOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Package className="mr-2 h-4 w-4" />新材料订单</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>新增水泥材料订单</DialogTitle></DialogHeader>
              <MaterialOrderForm onSubmit={(form) => createMaterial.mutate(form)} pending={createMaterial.isPending} />
            </DialogContent>
          </Dialog>
      </div>

      <MaterialForecastStrip
        forecasts={materialForecast}
        onInventoryChange={(material, currentQty) => updateInventory.mutate({ material, currentQty })}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div>
          <Label>从日期</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="min-w-[260px] flex-1">
          <Label>搜索</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="单号、公司、地址、司机、Invoice" className="pl-9" />
          </div>
        </div>
      </div>

      <Tabs defaultValue="concrete" className="space-y-4">
        <TabsList>
          <TabsTrigger value="concrete">水泥订单</TabsTrigger>
          <TabsTrigger value="materials">水泥材料</TabsTrigger>
        </TabsList>

        <TabsContent value="concrete">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">水泥订单列表</CardTitle>
            </CardHeader>
            <CardContent>
              <CementOrderCardsCompact
                orders={filteredCement}
                loading={cementLoading}
                vehicles={cementVehicles}
                onUpdate={(id, patch) => updateCement.mutate({ id, patch })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="materials">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">水泥材料列表</CardTitle>
            </CardHeader>
            <CardContent>
              <MaterialOrderCardsCompact
                orders={filteredMaterials}
                loading={materialLoading}
                onUpdate={(id, patch) => updateMaterial.mutate({ id, patch })}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({ title, value, icon: Icon, tone }: { title: string; value: string; icon: typeof Truck; tone: "blue" | "violet" | "amber" | "emerald" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    amber: "bg-amber-50 text-amber-800 border-amber-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
  };
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className={cn("rounded-md border p-2", tones[tone])}><Icon className="h-4 w-4" /></div>
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function materialQty(value: number, unit = "TON") {
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
}

function MaterialForecastStrip({ forecasts, onInventoryChange }: {
  forecasts: Array<{
    material: CementMaterialName;
    demandQty: number;
    currentQty: number;
    suggestedQty: number;
    unit: string;
  }>;
  onInventoryChange: (material: CementMaterialName, currentQty: number) => void;
}) {
  return (
    <div className="mb-3 grid gap-2 lg:grid-cols-3">
      {forecasts.map((item) => {
        const needsOrder = item.suggestedQty > 0;
        return (
          <div key={item.material} className={cn(
            "rounded-lg border bg-card px-3 py-2",
            needsOrder ? "border-amber-200" : "border-emerald-200",
          )}>
            <div className="grid grid-cols-[minmax(92px,1fr)_auto_auto_auto] items-center gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{item.material}</div>
                <div className={cn("text-xs", needsOrder ? "text-amber-700" : "text-emerald-700")}>
                  需订 {materialQty(item.suggestedQty, item.unit)}
                </div>
              </div>
              <MiniForecastValue label="需求" value={materialQty(item.demandQty, item.unit)} />
              <MiniForecastValue label="库存" value={materialQty(item.currentQty, item.unit)} />
              <Badge className={needsOrder ? "bg-amber-600" : "bg-emerald-600"}>
                {needsOrder ? "订" : "够"}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniForecastValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xs font-semibold">{value}</div>
    </div>
  );
}

function StatusBadge({ meta }: { meta: { label: string; className: string } }) {
  return <Badge variant="outline" className={cn("whitespace-nowrap", meta.className)}>{meta.label}</Badge>;
}

function CementOrderForm({ onSubmit, pending }: { onSubmit: (form: FormData) => void; pending: boolean }) {
  return (
    <form action={onSubmit} className="space-y-5">
      <FormSection title="订单时间">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="需求日期"><Input name="demand_date" type="date" defaultValue={todayISO()} required /></Field>
          <Field label="需求时间"><Input name="demand_time" placeholder="9-11AM / NOON" /></Field>
          <Field label="下单日期"><Input name="order_date" type="date" defaultValue={todayISO()} /></Field>
          <Field label="单号"><Input name="order_number" placeholder="可空" /></Field>
        </div>
      </FormSection>

      <FormSection title="客户信息">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="公司"><Input name="company" required /></Field>
          <Field label="TEL"><Input name="tel" /></Field>
        </div>
      </FormSection>

      <FormSection title="水泥规格">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="MPA">
            <Select name="mpa" defaultValue="32">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 MPA</SelectItem>
                <SelectItem value="15">15 MPA</SelectItem>
                <SelectItem value="20">20 MPA</SelectItem>
                <SelectItem value="25">25 MPA</SelectItem>
                <SelectItem value="30">30 MPA</SelectItem>
                <SelectItem value="32">32 MPA</SelectItem>
                <SelectItem value="35">35 MPA</SelectItem>
                <SelectItem value="40">40 MPA</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="AIR">
            <Select name="air" defaultValue="N">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="N">No Air</SelectItem>
                <SelectItem value="Y">Air</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="泵车">
            <Select name="pump_truck" defaultValue="no">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="no">不需要</SelectItem>
                <SelectItem value="yes">需要</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="需求数量 (CBM)"><Input name="order_qty_cbm" type="number" min="0" step="0.1" /></Field>
        </div>
      </FormSection>

      <FormSection title="地址备注">
        <Field label="送货地址"><Input name="delivery_address" required /></Field>
        <Field label="Note"><Textarea name="note" rows={3} /></Field>
      </FormSection>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "保存中..." : "保存水泥订单"}</Button>
      </div>
    </form>
  );
}

function MaterialOrderForm({ onSubmit, pending }: { onSubmit: (form: FormData) => void; pending: boolean }) {
  const [material, setMaterial] = useState<CementMaterialName>("Concrete Sand");
  const [company, setCompany] = useState(CEMENT_MATERIAL_DEFAULTS["Concrete Sand"].company);
  const [contact, setContact] = useState(CEMENT_MATERIAL_DEFAULTS["Concrete Sand"].contact);
  const [tel, setTel] = useState(CEMENT_MATERIAL_DEFAULTS["Concrete Sand"].tel);
  const [orderUnit, setOrderUnit] = useState(CEMENT_MATERIAL_DEFAULTS["Concrete Sand"].orderUnit);
  const [deliveryAddress, setDeliveryAddress] = useState(CEMENT_MATERIAL_DELIVERY_ADDRESS);

  const handleMaterialChange = (value: string) => {
    const next = value as CementMaterialName;
    const defaults = CEMENT_MATERIAL_DEFAULTS[next];
    setMaterial(next);
    setCompany(defaults.company);
    setContact(defaults.contact);
    setTel(defaults.tel);
    setOrderUnit(defaults.orderUnit);
    setDeliveryAddress(CEMENT_MATERIAL_DELIVERY_ADDRESS);
  };

  return (
    <form action={onSubmit} className="space-y-5">
      <FormSection title="订单时间">
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="下单日期"><Input name="order_date" type="date" defaultValue={todayISO()} /></Field>
        <Field label="单号"><Input name="order_number" placeholder="可空" /></Field>
        <Field label="需求日期"><Input name="demand_date" type="date" defaultValue={todayISO()} required /></Field>
        <Field label="需求时间"><Input name="demand_time" placeholder="AM / 12点左右" /></Field>
      </div>
      </FormSection>
      <FormSection title="材料供应商">
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="MATERIAL">
          <Select name="material" value={material} onValueChange={handleMaterialChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Concrete Sand">Concrete Sand</SelectItem>
              <SelectItem value="HL6">HL6</SelectItem>
              <SelectItem value="Cement">Cement</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="公司"><Input name="company" value={company} onChange={(e) => setCompany(e.target.value)} required /></Field>
        <Field label="CONTACT"><Input name="contact" value={contact} onChange={(e) => setContact(e.target.value)} /></Field>
        <Field label="TEL"><Input name="tel" value={tel} onChange={(e) => setTel(e.target.value)} /></Field>
      </div>
      </FormSection>
      <FormSection title="数量和地址">
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="需求数量"><Input name="order_qty" type="number" min="0" step="0.1" /></Field>
        <Field label="ORDER UNIT"><Input name="order_unit" value={orderUnit} onChange={(e) => setOrderUnit(e.target.value)} /></Field>
        <Field label="DELIVER UNIT"><Input value={CEMENT_MATERIAL_DELIVER_UNIT} disabled /></Field>
      </div>
      <Field label="送货地址"><Input name="delivery_address" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} required /></Field>
      <Field label="Note"><Textarea name="note" rows={3} /></Field>
      </FormSection>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "保存中..." : "保存材料订单"}</Button>
      </div>
    </form>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-3 text-sm font-semibold text-foreground">{title}</div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function InfoPill({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2.5 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 truncate text-sm", strong && "font-semibold text-foreground")}>{value}</div>
    </div>
  );
}

function CompactFact({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "blue" | "amber" }) {
  const toneClass = {
    neutral: "border-slate-200 bg-slate-50 text-slate-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
  }[tone];
  return (
    <div className={cn("rounded-md border px-2.5 py-2", toneClass)}>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function CementOrderCardsCompact({ orders, loading, vehicles, onUpdate }: {
  orders: CementOrder[];
  loading: boolean;
  vehicles: CementVehicle[];
  onUpdate: (id: string, patch: Partial<CementOrder>) => void;
}) {
  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>;
  if (orders.length === 0) return <div className="py-10 text-center text-sm text-muted-foreground">没有符合条件的水泥订单</div>;

  return (
    <div className="space-y-2">
      {orders.map((o) => {
        const secondary = [o.order_number, o.order_date ? `下单 ${o.order_date}` : null].filter(Boolean);
        return (
          <div key={o.id} className="rounded-lg border bg-background px-3 py-2.5 shadow-sm">
            <div className="grid gap-3 xl:grid-cols-[150px_180px_145px_minmax(260px,1.15fr)_minmax(180px,0.85fr)_230px_112px] xl:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{o.demand_date}</span>
                  {o.schedule_sequence != null && <Badge variant="outline">#{o.schedule_sequence}</Badge>}
                </div>
                {o.demand_time && <div className="mt-0.5 text-sm text-blue-700">{o.demand_time}</div>}
                <div className="mt-1"><StatusBadge meta={cementStatusMeta[o.status]} /></div>
              </div>

              <div className="min-w-0">
                <div className="truncate font-semibold">{o.company || "未填公司"}</div>
                {secondary.length > 0 && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{secondary.join(" · ")}</div>
                )}
              </div>

              <div className="truncate text-sm text-muted-foreground">{o.tel || ""}</div>
              <div className="truncate text-sm font-medium">{o.delivery_address || "未填地址"}</div>
              <div className="min-w-0">
                {o.note && <div className="line-clamp-2 text-xs text-muted-foreground">{o.note}</div>}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Badge className="bg-blue-600">{qty(o.order_qty_cbm, "CBM")}</Badge>
                {o.mpa && <Badge variant="outline">{o.mpa} MPA</Badge>}
                <Badge variant="outline">{o.air === "Y" ? "Air" : "No Air"}</Badge>
                {o.pump_truck && <Badge variant="secondary">泵车</Badge>}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <Input className="h-8" defaultValue={o.driver_name ?? ""} placeholder="司机" onBlur={(e) => onUpdate(o.id, { driver_name: toText(e.target.value) })} />
                <Select
                  value={o.vehicle_name || "__none"}
                  onValueChange={(value) => onUpdate(o.id, { vehicle_name: value === "__none" ? null : value })}
                >
                  <SelectTrigger className="h-8"><SelectValue placeholder="车辆" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">未选车辆</SelectItem>
                    {vehicles.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.name}>
                        {vehicle.name}{vehicle.plate && vehicle.plate !== vehicle.name ? ` · ${vehicle.plate}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input className="h-8" defaultValue={o.schedule_sequence ?? ""} placeholder="序号" type="number" onBlur={(e) => onUpdate(o.id, { schedule_sequence: toNumber(e.target.value) as number | null })} />
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={o.status === "completed"}
                onClick={() => onUpdate(o.id, { status: "completed" })}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                {o.status === "completed" ? "已完成" : "完成"}
              </Button>
            </div>

            <details className="mt-2 border-t pt-2">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">完成后详情</summary>
              <div className="mt-2 grid gap-1.5 md:grid-cols-3 xl:grid-cols-9">
                <Input className="h-8" defaultValue={o.arrival_time ?? ""} placeholder="到达" onBlur={(e) => onUpdate(o.id, { arrival_time: toText(e.target.value) })} />
                <Input className="h-8" defaultValue={o.finish_time ?? ""} placeholder="结束" onBlur={(e) => onUpdate(o.id, { finish_time: toText(e.target.value) })} />
                <Input className="h-8" defaultValue={o.delivered_qty_cbm ?? ""} placeholder="送货CBM" type="number" step="0.1" onBlur={(e) => onUpdate(o.id, { delivered_qty_cbm: toNumber(e.target.value) })} />
                <Input className="h-8" defaultValue={o.actual_usage_cbm ?? ""} placeholder="实际CBM" type="number" step="0.1" onBlur={(e) => onUpdate(o.id, { actual_usage_cbm: toNumber(e.target.value) })} />
                <Input className="h-8" defaultValue={o.receivable_amount ?? ""} placeholder="应收" type="number" step="0.01" onBlur={(e) => onUpdate(o.id, { receivable_amount: toNumber(e.target.value) })} />
                <Input className="h-8" defaultValue={o.driver_collected ?? ""} placeholder="司机收款" type="number" step="0.01" onBlur={(e) => onUpdate(o.id, { driver_collected: toNumber(e.target.value) })} />
                <Input className="h-8" defaultValue={o.paid_amount ?? ""} placeholder="已付" type="number" step="0.01" onBlur={(e) => onUpdate(o.id, { paid_amount: toNumber(e.target.value) })} />
                <Input className="h-8" defaultValue={o.invoice_number ?? ""} placeholder="Invoice" onBlur={(e) => onUpdate(o.id, { invoice_number: toText(e.target.value) })} />
                <Input className="h-8" defaultValue={o.print_status ?? ""} placeholder="打单" onBlur={(e) => onUpdate(o.id, { print_status: toText(e.target.value) })} />
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}

function MaterialOrderCardsCompact({ orders, loading, onUpdate }: {
  orders: CementMaterialOrder[];
  loading: boolean;
  onUpdate: (id: string, patch: Partial<CementMaterialOrder>) => void;
}) {
  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>;
  if (orders.length === 0) return <div className="py-10 text-center text-sm text-muted-foreground">没有符合条件的材料订单</div>;

  return (
    <div className="space-y-2">
      {orders.map((o) => {
        const supplier = [o.company, o.contact, o.tel].filter(Boolean).join(" · ");
        return (
          <div key={o.id} className="rounded-lg border bg-background px-3 py-2.5 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[150px_200px_minmax(220px,1fr)_minmax(240px,1fr)_132px] lg:items-center">
              <div>
                <div className="font-semibold">{o.demand_date}</div>
                {o.demand_time && <div className="text-sm text-violet-700">{o.demand_time}</div>}
                {o.order_number && <div className="text-xs text-muted-foreground">{o.order_number}</div>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge className="bg-violet-600">{o.material || "材料"}</Badge>
                <Badge variant="outline">{qty(o.order_qty, o.order_unit || "")}</Badge>
              </div>
              <div className="truncate text-sm">{supplier || "未填供应商"}</div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{o.delivery_address || "未填地址"}</div>
                {o.note && <div className="line-clamp-1 text-xs text-muted-foreground">{o.note}</div>}
              </div>
              <Select
                value={o.status === "delivered" || o.is_completed ? "delivered" : "pending"}
                onValueChange={(value) => onUpdate(o.id, {
                  status: value === "delivered" ? "delivered" : "pending",
                  is_completed: value === "delivered",
                })}
              >
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">未送达</SelectItem>
                  <SelectItem value="delivered">已送达</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CementOrderCardsV2({ orders, loading, onUpdate }: {
  orders: CementOrder[];
  loading: boolean;
  onUpdate: (id: string, patch: Partial<CementOrder>) => void;
}) {
  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>;
  if (orders.length === 0) return <div className="py-10 text-center text-sm text-muted-foreground">没有符合条件的水泥订单</div>;

  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const details = [
          o.tel ? `TEL ${o.tel}` : null,
          o.order_number ? `单号 ${o.order_number}` : null,
          o.order_date ? `下单 ${o.order_date}` : null,
        ].filter(Boolean);

        return (
          <div key={o.id} className="rounded-lg border bg-background shadow-sm">
            <div className="grid gap-0 lg:grid-cols-[170px_minmax(0,1fr)_260px]">
              <div className="border-b bg-slate-50 p-4 lg:border-b-0 lg:border-r">
                <div className="text-xs font-medium text-muted-foreground">需求时间</div>
                <div className="mt-1 text-lg font-semibold">{o.demand_date}</div>
                {o.demand_time && <div className="mt-1 text-sm font-medium text-blue-700">{o.demand_time}</div>}
                {o.schedule_sequence != null && <Badge variant="outline" className="mt-3">排班 #{o.schedule_sequence}</Badge>}
              </div>

              <div className="min-w-0 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{o.company || "未填公司"}</div>
                    {details.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {details.map((text) => <span key={text}>{text}</span>)}
                      </div>
                    )}
                  </div>
                  <StatusBadge meta={cementStatusMeta[o.status]} />
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <CompactFact label="数量" value={qty(o.order_qty_cbm, "CBM")} tone="blue" />
                  <CompactFact label="MPA" value={o.mpa || "-"} />
                  <CompactFact label="AIR" value={o.air === "Y" ? "Air" : "No Air"} />
                  <CompactFact label="泵车" value={o.pump_truck ? "需要" : "不需要"} tone={o.pump_truck ? "amber" : "neutral"} />
                </div>

                <div className="mt-3 rounded-md border bg-muted/20 px-3 py-2">
                  <div className="text-sm font-medium leading-snug">{o.delivery_address || "未填地址"}</div>
                  {o.note && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{o.note}</div>}
                </div>
              </div>

              <div className="border-t p-4 lg:border-l lg:border-t-0">
                <div className="mb-2 text-xs font-medium text-muted-foreground">调度</div>
                <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
                  <Input className="h-8" defaultValue={o.driver_name ?? ""} placeholder="司机" onBlur={(e) => onUpdate(o.id, { driver_name: toText(e.target.value) })} />
                  <Input className="h-8" defaultValue={o.vehicle_name ?? ""} placeholder="车辆" onBlur={(e) => onUpdate(o.id, { vehicle_name: toText(e.target.value) })} />
                  <Input className="h-8" defaultValue={o.schedule_sequence ?? ""} placeholder="序号" type="number" onBlur={(e) => onUpdate(o.id, { schedule_sequence: toNumber(e.target.value) as number | null })} />
                </div>
                <Select value={o.status} onValueChange={(value) => onUpdate(o.id, { status: value as CementStatus })}>
                  <SelectTrigger className="mt-2 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(cementStatusMeta).map(([value, meta]) => (
                      <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <details className="border-t px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">完成后详情</summary>
              <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
                <Input className="h-8" defaultValue={o.arrival_time ?? ""} placeholder="到达时间" onBlur={(e) => onUpdate(o.id, { arrival_time: toText(e.target.value) })} />
                <Input className="h-8" defaultValue={o.finish_time ?? ""} placeholder="结束时间" onBlur={(e) => onUpdate(o.id, { finish_time: toText(e.target.value) })} />
                <Input className="h-8" defaultValue={o.delivered_qty_cbm ?? ""} placeholder="送货CBM" type="number" step="0.1" onBlur={(e) => onUpdate(o.id, { delivered_qty_cbm: toNumber(e.target.value) })} />
                <Input className="h-8" defaultValue={o.actual_usage_cbm ?? ""} placeholder="实际CBM" type="number" step="0.1" onBlur={(e) => onUpdate(o.id, { actual_usage_cbm: toNumber(e.target.value) })} />
                <Input className="h-8" defaultValue={o.receivable_amount ?? ""} placeholder="应收金额" type="number" step="0.01" onBlur={(e) => onUpdate(o.id, { receivable_amount: toNumber(e.target.value) })} />
                <Input className="h-8" defaultValue={o.driver_collected ?? ""} placeholder="司机收款" type="number" step="0.01" onBlur={(e) => onUpdate(o.id, { driver_collected: toNumber(e.target.value) })} />
                <Input className="h-8" defaultValue={o.paid_amount ?? ""} placeholder="已付" type="number" step="0.01" onBlur={(e) => onUpdate(o.id, { paid_amount: toNumber(e.target.value) })} />
                <Input className="h-8" defaultValue={o.invoice_number ?? ""} placeholder="Invoice" onBlur={(e) => onUpdate(o.id, { invoice_number: toText(e.target.value) })} />
                <Input className="h-8" defaultValue={o.print_status ?? ""} placeholder="打单" onBlur={(e) => onUpdate(o.id, { print_status: toText(e.target.value) })} />
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}

function MaterialOrderCardsV2({ orders, loading }: {
  orders: CementMaterialOrder[];
  loading: boolean;
  onUpdate: (id: string, patch: Partial<CementMaterialOrder>) => void;
}) {
  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>;
  if (orders.length === 0) return <div className="py-10 text-center text-sm text-muted-foreground">没有符合条件的材料订单</div>;

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {orders.map((o) => {
        const supplier = [o.company, o.contact, o.tel].filter(Boolean).join(" · ");
        return (
          <div key={o.id} className="rounded-lg border bg-background p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground">需求时间</div>
                <div className="mt-1 font-semibold">{o.demand_date}{o.demand_time ? ` · ${o.demand_time}` : ""}</div>
              </div>
              {o.order_number && <Badge variant="outline">{o.order_number}</Badge>}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px]">
              <div className="min-w-0">
                <div className="text-lg font-semibold">{o.material || "未填材料"}</div>
                {supplier && <div className="mt-1 text-sm text-muted-foreground">{supplier}</div>}
              </div>
              <div className="rounded-md border bg-violet-50 px-3 py-2 text-violet-900">
                <div className="text-xs font-medium text-violet-700">订货数量</div>
                <div className="mt-0.5 font-semibold">{qty(o.order_qty, o.order_unit || "")}</div>
              </div>
            </div>

            <div className="mt-3 rounded-md border bg-muted/20 px-3 py-2">
              <div className="text-sm font-medium">{o.delivery_address || "未填地址"}</div>
              {o.note && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{o.note}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CementOrderCards({ orders, loading, onUpdate }: {
  orders: CementOrder[];
  loading: boolean;
  onUpdate: (id: string, patch: Partial<CementOrder>) => void;
}) {
  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>;
  if (orders.length === 0) return <div className="py-10 text-center text-sm text-muted-foreground">没有符合条件的水泥订单</div>;

  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <div key={o.id} className="rounded-lg border bg-background p-4 shadow-sm transition-colors hover:bg-muted/20">
          <div className="grid gap-4 xl:grid-cols-[180px_minmax(260px,1fr)_220px_260px_140px]">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-blue-50 px-2.5 py-1 text-sm font-semibold text-blue-700">
                  {o.demand_date}
                </div>
                {o.schedule_sequence != null && <Badge variant="outline">#{o.schedule_sequence}</Badge>}
              </div>
              <div className="text-sm font-medium">{o.demand_time || "时间未定"}</div>
              <div className="text-xs text-muted-foreground">{o.order_number || "无单号"}</div>
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-base font-semibold">{o.company}</div>
                <StatusBadge meta={cementStatusMeta[o.status]} />
              </div>
              <div className="text-sm text-muted-foreground">{o.tel || "无电话"}</div>
              <div className="truncate text-sm font-medium">{o.delivery_address}</div>
              {o.note && <div className="line-clamp-2 text-xs text-muted-foreground">{o.note}</div>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <InfoPill label="数量" value={qty(o.order_qty_cbm, "CBM")} strong />
              <InfoPill label="MPA" value={o.mpa || "-"} />
              <InfoPill label="AIR" value={o.air === "Y" ? "Air" : "No Air"} />
              <InfoPill label="泵车" value={o.pump_truck ? "需要" : "不需要"} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Input className="h-8" defaultValue={o.driver_name ?? ""} placeholder="司机" onBlur={(e) => onUpdate(o.id, { driver_name: toText(e.target.value) })} />
              <Input className="h-8" defaultValue={o.vehicle_name ?? ""} placeholder="车辆" onBlur={(e) => onUpdate(o.id, { vehicle_name: toText(e.target.value) })} />
              <Input className="h-8" defaultValue={o.schedule_sequence ?? ""} placeholder="序号" type="number" onBlur={(e) => onUpdate(o.id, { schedule_sequence: toNumber(e.target.value) as number | null })} />
            </div>

            <Select value={o.status} onValueChange={(value) => onUpdate(o.id, { status: value as CementStatus })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(cementStatusMeta).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <details className="mt-3 border-t pt-3">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">完成后详情</summary>
            <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
              <Input className="h-8" defaultValue={o.arrival_time ?? ""} placeholder="到达时间" onBlur={(e) => onUpdate(o.id, { arrival_time: toText(e.target.value) })} />
              <Input className="h-8" defaultValue={o.finish_time ?? ""} placeholder="结束时间" onBlur={(e) => onUpdate(o.id, { finish_time: toText(e.target.value) })} />
              <Input className="h-8" defaultValue={o.delivered_qty_cbm ?? ""} placeholder="送货CBM" type="number" step="0.1" onBlur={(e) => onUpdate(o.id, { delivered_qty_cbm: toNumber(e.target.value) })} />
              <Input className="h-8" defaultValue={o.actual_usage_cbm ?? ""} placeholder="实际CBM" type="number" step="0.1" onBlur={(e) => onUpdate(o.id, { actual_usage_cbm: toNumber(e.target.value) })} />
              <Input className="h-8" defaultValue={o.receivable_amount ?? ""} placeholder="应收金额" type="number" step="0.01" onBlur={(e) => onUpdate(o.id, { receivable_amount: toNumber(e.target.value) })} />
              <Input className="h-8" defaultValue={o.driver_collected ?? ""} placeholder="司机收款" type="number" step="0.01" onBlur={(e) => onUpdate(o.id, { driver_collected: toNumber(e.target.value) })} />
              <Input className="h-8" defaultValue={o.paid_amount ?? ""} placeholder="已付" type="number" step="0.01" onBlur={(e) => onUpdate(o.id, { paid_amount: toNumber(e.target.value) })} />
              <Input className="h-8" defaultValue={o.invoice_number ?? ""} placeholder="Invoice" onBlur={(e) => onUpdate(o.id, { invoice_number: toText(e.target.value) })} />
              <Input className="h-8" defaultValue={o.print_status ?? ""} placeholder="打单" onBlur={(e) => onUpdate(o.id, { print_status: toText(e.target.value) })} />
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}

function CementTable({ orders, loading, onUpdate }: {
  orders: CementOrder[];
  loading: boolean;
  onUpdate: (id: string, patch: Partial<CementOrder>) => void;
}) {
  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>;
  if (orders.length === 0) return <div className="py-10 text-center text-sm text-muted-foreground">没有符合条件的水泥订单</div>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-[170px]">需求</TableHead>
          <TableHead className="min-w-[210px]">客户</TableHead>
          <TableHead className="min-w-[150px]">规格数量</TableHead>
          <TableHead className="min-w-[280px]">地址 / Note</TableHead>
          <TableHead className="min-w-[190px]">调度</TableHead>
          <TableHead className="min-w-[210px]">执行</TableHead>
          <TableHead className="min-w-[180px]">金额发票</TableHead>
          <TableHead className="min-w-[120px]">状态</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => (
          <TableRow key={o.id}>
            <TableCell>
              <div className="font-medium">{o.demand_date}</div>
              <div className="text-sm text-muted-foreground">{o.demand_time || "-"}</div>
              <div className="mt-1 text-xs text-muted-foreground">下单 {o.order_date || "-"}</div>
              <div className="text-xs text-muted-foreground">#{o.order_number || "-"}</div>
            </TableCell>
            <TableCell>
              <div className="font-medium">{o.company}</div>
              <div className="text-sm text-muted-foreground">{o.tel || "-"}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {o.pump_truck && <Badge variant="secondary">泵车</Badge>}
                {o.air && <Badge variant="outline">AIR {o.air}</Badge>}
              </div>
            </TableCell>
            <TableCell>
              <div className="font-semibold">{qty(o.order_qty_cbm, "CBM")}</div>
              <div className="text-sm text-muted-foreground">送 {qty(o.delivered_qty_cbm, "CBM")}</div>
              <div className="text-sm text-muted-foreground">实际 {qty(o.actual_usage_cbm, "CBM")}</div>
              <div className="text-sm text-muted-foreground">MPA {o.mpa || "-"}</div>
            </TableCell>
            <TableCell>
              <div className="font-medium leading-snug">{o.delivery_address}</div>
              {o.note && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{o.note}</div>}
            </TableCell>
            <TableCell>
              <div className="grid gap-2">
                <Input defaultValue={o.driver_name ?? ""} placeholder="司机" onBlur={(e) => onUpdate(o.id, { driver_name: toText(e.target.value) })} />
                <Input defaultValue={o.vehicle_name ?? ""} placeholder="车辆" onBlur={(e) => onUpdate(o.id, { vehicle_name: toText(e.target.value) })} />
                <Input defaultValue={o.schedule_sequence ?? ""} placeholder="排班序号" type="number" onBlur={(e) => onUpdate(o.id, { schedule_sequence: toNumber(e.target.value) as number | null })} />
              </div>
            </TableCell>
            <TableCell>
              <div className="grid grid-cols-2 gap-2">
                <Input defaultValue={o.arrival_time ?? ""} placeholder="到达" onBlur={(e) => onUpdate(o.id, { arrival_time: toText(e.target.value) })} />
                <Input defaultValue={o.finish_time ?? ""} placeholder="结束" onBlur={(e) => onUpdate(o.id, { finish_time: toText(e.target.value) })} />
                <Input defaultValue={o.delivered_qty_cbm ?? ""} placeholder="送货CBM" type="number" step="0.1" onBlur={(e) => onUpdate(o.id, { delivered_qty_cbm: toNumber(e.target.value) })} />
                <Input defaultValue={o.actual_usage_cbm ?? ""} placeholder="实际CBM" type="number" step="0.1" onBlur={(e) => onUpdate(o.id, { actual_usage_cbm: toNumber(e.target.value) })} />
              </div>
            </TableCell>
            <TableCell>
              <div className="grid gap-2">
                <Input defaultValue={o.receivable_amount ?? ""} placeholder="应收金额" type="number" step="0.01" onBlur={(e) => onUpdate(o.id, { receivable_amount: toNumber(e.target.value) })} />
                <Input defaultValue={o.driver_collected ?? ""} placeholder="司机收款" type="number" step="0.01" onBlur={(e) => onUpdate(o.id, { driver_collected: toNumber(e.target.value) })} />
                <Input defaultValue={o.invoice_number ?? ""} placeholder="Invoice" onBlur={(e) => onUpdate(o.id, { invoice_number: toText(e.target.value) })} />
              </div>
            </TableCell>
            <TableCell>
              <div className="space-y-2">
                <StatusBadge meta={cementStatusMeta[o.status]} />
                <Select value={o.status} onValueChange={(value) => onUpdate(o.id, { status: value as CementStatus })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(cementStatusMeta).map(([value, meta]) => (
                      <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MaterialOrderCards({ orders, loading }: {
  orders: CementMaterialOrder[];
  loading: boolean;
  onUpdate: (id: string, patch: Partial<CementMaterialOrder>) => void;
}) {
  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>;
  if (orders.length === 0) return <div className="py-10 text-center text-sm text-muted-foreground">没有符合条件的材料订单</div>;

  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <div key={o.id} className="rounded-lg border bg-background p-4 shadow-sm transition-colors hover:bg-muted/20">
          <div className="grid gap-4 lg:grid-cols-[180px_minmax(240px,1fr)_220px_minmax(260px,1.2fr)]">
            <div className="space-y-2">
              <div className="rounded-md bg-violet-50 px-2.5 py-1 text-sm font-semibold text-violet-700">
                {o.demand_date}
              </div>
              <div className="text-sm font-medium">{o.demand_time || "时间未定"}</div>
              <div className="text-xs text-muted-foreground">{o.order_number || "无单号"}</div>
            </div>

            <div className="min-w-0 space-y-1">
              <div className="truncate text-base font-semibold">{o.company}</div>
              <div className="text-sm text-muted-foreground">{o.contact || "无联系人"}</div>
              <div className="text-sm text-muted-foreground">{o.tel || "无电话"}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <InfoPill label="材料" value={o.material || "-"} strong />
              <InfoPill label="数量" value={qty(o.order_qty, o.order_unit || "")} />
            </div>

            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{o.delivery_address}</div>
              {o.note && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{o.note}</div>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MaterialTable({ orders, loading, onUpdate }: {
  orders: CementMaterialOrder[];
  loading: boolean;
  onUpdate: (id: string, patch: Partial<CementMaterialOrder>) => void;
}) {
  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>;
  if (orders.length === 0) return <div className="py-10 text-center text-sm text-muted-foreground">没有符合条件的材料订单</div>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-[170px]">需求</TableHead>
          <TableHead className="min-w-[210px]">客户</TableHead>
          <TableHead className="min-w-[180px]">材料数量</TableHead>
          <TableHead className="min-w-[280px]">地址 / Note</TableHead>
          <TableHead className="min-w-[160px]">调度</TableHead>
          <TableHead className="min-w-[170px]">交付</TableHead>
          <TableHead className="min-w-[140px]">状态</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => (
          <TableRow key={o.id}>
            <TableCell>
              <div className="font-medium">{o.demand_date}</div>
              <div className="text-sm text-muted-foreground">{o.demand_time || "-"}</div>
              <div className="mt-1 text-xs text-muted-foreground">下单 {o.order_date || "-"}</div>
              <div className="text-xs text-muted-foreground">#{o.order_number || "-"}</div>
            </TableCell>
            <TableCell>
              <div className="font-medium">{o.company}</div>
              <div className="text-sm text-muted-foreground">{o.contact || "-"}</div>
              <div className="text-sm text-muted-foreground">{o.tel || "-"}</div>
            </TableCell>
            <TableCell>
              <div className="font-semibold">{o.material}</div>
              <div className="text-sm text-muted-foreground">订 {qty(o.order_qty, o.order_unit || "")}</div>
              <div className="text-sm text-muted-foreground">送 {qty(o.delivered_qty, o.deliver_unit || o.order_unit || "")}</div>
            </TableCell>
            <TableCell>
              <div className="font-medium leading-snug">{o.delivery_address}</div>
              {o.note && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{o.note}</div>}
            </TableCell>
            <TableCell>
              <Input defaultValue={o.driver_name ?? ""} placeholder="司机" onBlur={(e) => onUpdate(o.id, { driver_name: toText(e.target.value) })} />
            </TableCell>
            <TableCell>
              <div className="grid gap-2">
                <Input defaultValue={o.delivered_qty ?? ""} placeholder="送货数量" type="number" step="0.1" onBlur={(e) => onUpdate(o.id, { delivered_qty: toNumber(e.target.value) })} />
                <Input defaultValue={o.invoice_number ?? ""} placeholder="Invoice" onBlur={(e) => onUpdate(o.id, { invoice_number: toText(e.target.value) })} />
              </div>
            </TableCell>
            <TableCell>
              <div className="space-y-2">
                <StatusBadge meta={materialStatusMeta[o.status]} />
                <Select value={o.status} onValueChange={(value) => onUpdate(o.id, { status: value as MaterialStatus, is_completed: value === "completed" })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(materialStatusMeta).map(([value, meta]) => (
                      <SelectItem key={value} value={value}>{meta.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {o.is_completed && <div className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />已完成</div>}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
