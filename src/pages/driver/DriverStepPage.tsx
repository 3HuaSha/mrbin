import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Camera, Navigation, Phone, Loader2 } from "lucide-react";
import { STEP_TYPE_EMOJI, STEP_TYPE_LABEL } from "@/lib/business";
import { toast } from "sonner";

type Step = {
  id: string;
  step_number: number;
  step_type: string;
  location: string;
  status: string;
  requires_photo: boolean;
  requires_bin_number: boolean;
  requires_weigh_ticket: boolean;
  requires_weight: boolean;
  photo_url: string | null;
  bin_number_reported: string | null;
  old_bin_number_reported: string | null;
  weigh_ticket_url: string | null;
  weight_kg: number | null;
  dump_site: string | null;
  assignment_id: string;
  dispatch_assignments: {
    orders: { order_number: string; type: string; address: string; customer_name: string; customer_phone: string; customer_notes: string | null };
    bins: { bin_number: string } | null;
  };
};

export function DriverStepPage() {
  const { stepId } = useParams({ from: "/driver/step/$stepId" });
  const nav = useNavigate();
  const qc = useQueryClient();

  const [photoUrl, setPhotoUrl] = useState("");
  const [binNumber, setBinNumber] = useState("");
  const [oldBinNumber, setOldBinNumber] = useState("");
  const [weighTicketUrl, setWeighTicketUrl] = useState("");
  const [weight, setWeight] = useState("");
  const [dumpSite, setDumpSite] = useState("");
  const [uploading, setUploading] = useState<null | "photo" | "weigh">(null);

  const { data: step, isLoading } = useQuery({
    queryKey: ["job-step", stepId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_steps")
        .select("*, dispatch_assignments(orders(*), bins(bin_number))")
        .eq("id", stepId)
        .single();
      if (error) throw error;
      return data as unknown as Step;
    },
  });

  // 默认填入调度指定的桶号
  useEffect(() => {
    if (step?.dispatch_assignments?.bins?.bin_number && !binNumber) {
      setBinNumber(step.dispatch_assignments.bins.bin_number);
    }
  }, [step, binNumber]);

  const isSwapDelivery = step?.dispatch_assignments?.orders?.type === "swap" && step?.step_type === "customer_delivery";

  const handleUpload = async (file: File, kind: "photo" | "weigh") => {
    setUploading(kind);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${stepId}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("driver-uploads").upload(path, file, { upsert: true });
    setUploading(null);
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("driver-uploads").getPublicUrl(path);
    if (kind === "photo") setPhotoUrl(data.publicUrl);
    else setWeighTicketUrl(data.publicUrl);
    toast.success("上传成功");
  };

  const canComplete = () => {
    if (!step) return false;
    if (step.requires_photo && !photoUrl) return false;
    if (step.requires_bin_number && !binNumber.trim()) return false;
    if (isSwapDelivery && !oldBinNumber.trim()) return false;
    if (step.requires_weigh_ticket && !weighTicketUrl) return false;
    if (step.requires_weight && !weight) return false;
    if (step.step_type === "dump_site" && !dumpSite.trim()) return false;
    return true;
  };

  const complete = useMutation({
    mutationFn: async () => {
      const update: Record<string, unknown> = { status: "done" };
      if (photoUrl) update.photo_url = photoUrl;
      if (binNumber) update.bin_number_reported = binNumber.trim();
      if (oldBinNumber) update.old_bin_number_reported = oldBinNumber.trim();
      if (weighTicketUrl) update.weigh_ticket_url = weighTicketUrl;
      if (weight) update.weight_kg = parseFloat(weight);
      if (dumpSite) update.dump_site = dumpSite.trim();
      const { error } = await supabase.from("job_steps").update(update as any).eq("id", stepId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("步骤已完成 ✅");
      qc.invalidateQueries({ queryKey: ["driver-steps"] });
      nav({ to: "/driver" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !step) return <div className="p-6 text-center text-muted-foreground">加载中…</div>;

  const order = step.dispatch_assignments.orders;
  const isCustomerStep = step.step_type === "customer_delivery" || step.step_type === "customer_pickup";

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="sticky top-0 z-10 bg-sidebar text-sidebar-foreground px-4 py-3 flex items-center gap-3">
        <Link to="/driver" className="-ml-2 p-2"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1 text-center text-sm font-semibold">步骤 {step.step_number}</div>
        <div className="w-9" />
      </header>

      <div className="p-4 space-y-4">
        <div>
          <div className="text-xs text-muted-foreground font-mono">{order.order_number}</div>
          <div className="text-2xl font-bold mt-1">{STEP_TYPE_EMOJI[step.step_type]} {STEP_TYPE_LABEL[step.step_type]}</div>
          <div className="text-base mt-2">{step.location}</div>
        </div>

        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(step.location)}`}
          target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-4 font-semibold text-base"
        >
          <Navigation className="h-5 w-5" /> 在 Google Maps 中导航
        </a>

        {isCustomerStep && (
          <div className="bg-card border rounded-xl p-4 space-y-2">
            <div className="font-semibold">{order.customer_name}</div>
            <a href={`tel:${order.customer_phone}`} className="flex items-center gap-2 text-primary font-medium">
              <Phone className="h-4 w-4" /> {order.customer_phone}
            </a>
            {order.customer_notes && (
              <div className="bg-status-progress/15 text-status-progress text-sm rounded p-2">
                📝 {order.customer_notes}
              </div>
            )}
          </div>
        )}

        <div className="bg-card border rounded-xl p-4 space-y-4">
          <div className="font-semibold text-sm">需要完成</div>

          {step.requires_photo && (
            <div>
              <Label>拍照 *</Label>
              <label className="mt-1 flex items-center justify-center gap-2 h-14 rounded-md border-2 border-dashed border-border bg-background cursor-pointer">
                {uploading === "photo" ? <Loader2 className="h-5 w-5 animate-spin" /> :
                  photoUrl ? <span className="text-status-done font-medium">✓ 已上传(点击重传)</span> :
                  <><Camera className="h-5 w-5" /><span>拍照</span></>}
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "photo")} />
              </label>
              {photoUrl && <img src={photoUrl} alt="预览" className="mt-2 max-h-40 rounded" />}
            </div>
          )}

          {step.requires_bin_number && (
            <div>
              <Label>{isSwapDelivery ? "放入的新桶号 *" : "桶号 *"}</Label>
              <Input value={binNumber} onChange={(e) => setBinNumber(e.target.value.toUpperCase())} className="h-12 mt-1 text-base" placeholder="B-20-01" />
            </div>
          )}

          {isSwapDelivery && (
            <div>
              <Label>取出的旧桶号 *</Label>
              <Input value={oldBinNumber} onChange={(e) => setOldBinNumber(e.target.value.toUpperCase())} className="h-12 mt-1 text-base" placeholder="B-20-02" />
            </div>
          )}

          {step.step_type === "dump_site" && (
            <div>
              <Label>垃圾场名称 *</Label>
              <Input value={dumpSite} onChange={(e) => setDumpSite(e.target.value)} className="h-12 mt-1 text-base" placeholder="例如 GFL Brock West" />
            </div>
          )}

          {step.requires_weigh_ticket && (
            <div>
              <Label>磅单照片 *</Label>
              <label className="mt-1 flex items-center justify-center gap-2 h-14 rounded-md border-2 border-dashed border-border bg-background cursor-pointer">
                {uploading === "weigh" ? <Loader2 className="h-5 w-5 animate-spin" /> :
                  weighTicketUrl ? <span className="text-status-done font-medium">✓ 已上传</span> :
                  <><Camera className="h-5 w-5" /><span>拍磅单</span></>}
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "weigh")} />
              </label>
            </div>
          )}

          {step.requires_weight && (
            <div>
              <Label>重量 (kg) *</Label>
              <Input type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className="h-12 mt-1 text-base" placeholder="0" />
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t">
        <Button onClick={() => complete.mutate()} disabled={!canComplete() || complete.isPending}
          className="w-full h-14 text-base font-bold">
          {complete.isPending ? "提交中..." : "完成此步骤"}
        </Button>
      </div>
    </div>
  );
}
