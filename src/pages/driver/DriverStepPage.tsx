import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Camera, Navigation, Phone, Loader2, CheckCircle2 } from "lucide-react";
import { STEP_TYPE_EMOJI, STEP_TYPE_LABEL } from "@/lib/business";
import { toast } from "sonner";
import { useAudit } from "@/hooks/use-audit";

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
  assignment_id: string | null;
  node_type: 'order' | 'step';
  notes: string | null;
  dispatch_assignments: {
    orders: { order_number: string; type: string; bin_size: string | null; bin_type: string | null; address: string; customer_name: string; customer_phone: string; customer_notes: string | null } | null;
    bins: { bin_number: string } | null;
  } | null;
};

export function DriverStepPage() {
  const { stepId } = useParams({ from: "/driver/step/$stepId" });
  const nav = useNavigate();
  const qc = useQueryClient();
  const audit = useAudit();
  const [photoUrl, setPhotoUrl] = useState("");
  const [pickupPhotoUrl, setPickupPhotoUrl] = useState("");
  const [binNumber, setBinNumber] = useState("");
  const [oldBinNumber, setOldBinNumber] = useState("");
  const [weighTicketUrl, setWeighTicketUrl] = useState("");
  const [weight, setWeight] = useState("");
  const [dumpSite, setDumpSite] = useState("");
  const [uploading, setUploading] = useState<null | "photo" | "pickup_photo" | "weigh">(null);

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

  const order = step?.dispatch_assignments?.orders ?? null;
  const isManualStep = step?.node_type === 'step' || !order;
  const isSwapDelivery = order?.type === "swap" && (step?.step_type === "customer_delivery" || step?.step_type === "swap");
  const isDumpWaste = step?.step_type === "dump_waste";

  const handleUpload = async (file: File, kind: "photo" | "pickup_photo" | "weigh") => {
    setUploading(kind);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${stepId}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("driver-uploads").upload(path, file, { upsert: true });
    setUploading(null);
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("driver-uploads").getPublicUrl(path);
    if (kind === "photo") setPhotoUrl(data.publicUrl);
    else if (kind === "pickup_photo") setPickupPhotoUrl(data.publicUrl);
    else setWeighTicketUrl(data.publicUrl);
    toast.success("上传成功");
  };

  const canComplete = () => {
    if (!step) return false;
    if (step.requires_photo && !photoUrl) return false;
    if (step.step_type === "dump_waste" && !photoUrl) return false;
    // 桶号改为非强制 (staff 可在订单页后期补绑或司机补报)
    if (step.requires_weigh_ticket && !weighTicketUrl) return false;
    if (step.requires_weight && !weight) return false;
    if (step.step_type === "dump_site" && !dumpSite.trim()) return false;
    return true;
  };

  const complete = useMutation({
    mutationFn: async () => {
      const update: Record<string, unknown> = { status: "done" };
      if (photoUrl) update.photo_url = photoUrl;
      if (pickupPhotoUrl) update.pickup_photo_url = pickupPhotoUrl;
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
      audit({
        action: "step_complete",
        entity_type: "job_step",
        entity_id: stepId,
        entity_label: `${order?.order_number ?? "手动"} 步骤${step?.step_number ?? ""}`,
        details: {
          step_type: step?.step_type,
          bin: binNumber || undefined,
          old_bin: oldBinNumber || undefined,
          weight_kg: weight ? parseFloat(weight) : undefined,
          dump_site: dumpSite || undefined,
        },
      });
      qc.invalidateQueries({ queryKey: ["driver-steps"] });
      nav({ to: "/driver" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !step) return <div className="p-6 text-center text-muted-foreground">加载中…</div>;

  const isCustomerStep = !isManualStep && (
    step.step_type === "customer_delivery" ||
    step.step_type === "customer_pickup" ||
    step.step_type === "swap" ||
    step.step_type === "delivery" ||
    step.step_type === "pickup"
  );

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="sticky top-0 z-10 bg-sidebar text-sidebar-foreground px-4 py-3 flex items-center gap-3">
        <Link to="/driver" className="-ml-2 p-2"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1 text-center text-sm font-semibold">步骤 {step.step_number}</div>
        <div className="w-9" />
      </header>

      <div className="p-4 space-y-4">
        <div>
          <div className="text-2xl font-bold mt-1">
            {STEP_TYPE_EMOJI[step.step_type]} {isManualStep
              ? (STEP_TYPE_LABEL[step.step_type] || step.step_type)
              : order
                ? `${order.type === 'delivery' ? '送' : order.type === 'pickup' ? '收' : order.type === 'swap' ? '换' : ''}${order.bin_size ? order.bin_size + 'yd' : ''}${order.bin_type ? ({'garbage':'垃圾桶','brick':'砖桶','soil':'土桶','cement':'水泥桶','asphalt':'沥青桶'} as Record<string,string>)[order.bin_type] || order.bin_type : '桶'}`
                : (STEP_TYPE_LABEL[step.step_type] || step.step_type)
            }
          </div>
          <div className="text-base mt-2">{step.location}</div>
        </div>

        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(step.location)}`}
          target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-4 font-semibold text-base"
        >
          <Navigation className="h-5 w-5" /> 在 Google Maps 中导航
        </a>

        {isCustomerStep && order && (
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

        {isManualStep && step.notes && (
          <div className="bg-card border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">备注</div>
            <div className="text-sm whitespace-pre-wrap">📝 {step.notes}</div>
          </div>
        )}

        <div className="bg-card border rounded-xl p-4 space-y-4">
          <div className="font-semibold text-sm">需要完成</div>

          {/* 拍照上传: dump_waste 需要"垃圾照片"(必填)+"垃圾单照片"(可选); swap 需要"送新桶"+"收旧桶"; 其他一张即可 */}
          {isDumpWaste ? (
            <>
              <div>
                <Label className="text-base font-semibold">📷 垃圾照片 *</Label>
                <label className="mt-2 flex flex-col items-center justify-center gap-3 min-h-[120px] rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors p-4">
                  {uploading === "photo" ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">上传中...</span>
                    </div>
                  ) : photoUrl ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <div className="text-status-done font-semibold text-base flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        垃圾照片已上传
                      </div>
                      <span className="text-xs text-muted-foreground">点击重新拍照</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Camera className="h-10 w-10 text-primary" />
                      <span className="font-medium text-base">点击拍摄垃圾</span>
                      <span className="text-xs text-muted-foreground">倒垃圾现场照片</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "photo")} />
                </label>
                {photoUrl && (
                  <div className="mt-3 rounded-lg overflow-hidden border bg-muted">
                    <img src={photoUrl} alt="垃圾预览" className="w-full h-auto max-h-[300px] object-contain" />
                  </div>
                )}
              </div>

              <div>
                <Label className="text-base font-semibold">📋 垃圾单照片 (可选)</Label>
                <label className="mt-2 flex flex-col items-center justify-center gap-3 min-h-[120px] rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors p-4">
                  {uploading === "weigh" ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">上传中...</span>
                    </div>
                  ) : weighTicketUrl ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <div className="text-status-done font-semibold text-base flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        垃圾单已上传
                      </div>
                      <span className="text-xs text-muted-foreground">点击重新拍照</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Camera className="h-10 w-10 text-primary" />
                      <span className="font-medium text-base">点击拍摄垃圾单</span>
                      <span className="text-xs text-muted-foreground">垃圾场收据（可选）</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "weigh")} />
                </label>
                {weighTicketUrl && (
                  <div className="mt-3 rounded-lg overflow-hidden border bg-muted">
                    <img src={weighTicketUrl} alt="垃圾单预览" className="w-full h-auto max-h-[300px] object-contain" />
                  </div>
                )}
              </div>
            </>
          ) : isSwapDelivery ? (
            <>
              <div>
                <Label className="text-base font-semibold">📷 送新桶照片 {step.requires_photo && '*'}</Label>
                <label className="mt-2 flex flex-col items-center justify-center gap-3 min-h-[120px] rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors p-4">
                  {uploading === "photo" ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">上传中...</span>
                    </div>
                  ) : photoUrl ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <div className="text-status-done font-semibold text-base flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        新桶照片已上传
                      </div>
                      <span className="text-xs text-muted-foreground">点击重新拍照</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Camera className="h-10 w-10 text-primary" />
                      <span className="font-medium text-base">点击拍摄新桶</span>
                      <span className="text-xs text-muted-foreground">送到客户的桶</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "photo")} />
                </label>
                {photoUrl && (
                  <div className="mt-3 rounded-lg overflow-hidden border bg-muted">
                    <img src={photoUrl} alt="新桶预览" className="w-full h-auto max-h-[300px] object-contain" />
                  </div>
                )}
              </div>

              <div>
                <Label className="text-base font-semibold">📷 收旧桶照片 (可选)</Label>
                <label className="mt-2 flex flex-col items-center justify-center gap-3 min-h-[120px] rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors p-4">
                  {uploading === "pickup_photo" ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">上传中...</span>
                    </div>
                  ) : pickupPhotoUrl ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <div className="text-status-done font-semibold text-base flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        旧桶照片已上传
                      </div>
                      <span className="text-xs text-muted-foreground">点击重新拍照</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Camera className="h-10 w-10 text-primary" />
                      <span className="font-medium text-base">点击拍摄旧桶</span>
                      <span className="text-xs text-muted-foreground">从客户收走的桶</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "pickup_photo")} />
                </label>
                {pickupPhotoUrl && (
                  <div className="mt-3 rounded-lg overflow-hidden border bg-muted">
                    <img src={pickupPhotoUrl} alt="旧桶预览" className="w-full h-auto max-h-[300px] object-contain" />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div>
              <Label className="text-base font-semibold">📷 拍照上传 {step.requires_photo && '*'}</Label>
              <label className="mt-2 flex flex-col items-center justify-center gap-3 min-h-[120px] rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors p-4">
                {uploading === "photo" ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">上传中...</span>
                  </div>
                ) : photoUrl ? (
                  <div className="flex flex-col items-center gap-2 w-full">
                    <div className="text-status-done font-semibold text-base flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      照片已上传
                    </div>
                    <span className="text-xs text-muted-foreground">点击重新拍照</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Camera className="h-10 w-10 text-primary" />
                    <span className="font-medium text-base">点击拍照</span>
                    <span className="text-xs text-muted-foreground">或选择相册图片</span>
                  </div>
                )}
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "photo")} />
              </label>
              {photoUrl && (
                <div className="mt-3 rounded-lg overflow-hidden border bg-muted">
                  <img
                    src={photoUrl}
                    alt="预览"
                    className="w-full h-auto max-h-[300px] object-contain"
                  />
                </div>
              )}
            </div>
          )}

          {/* 桶号输入 - 所有步骤都可以填 (可选) */}
          <div>
            <Label>{isSwapDelivery ? "放入的新桶号 (可选)" : "桶号 (可选)"}</Label>
            <Input value={binNumber} onChange={(e) => setBinNumber(e.target.value.toUpperCase())} className="h-12 mt-1 text-base" placeholder="B-20-01" />
          </div>

          {isSwapDelivery && (
            <div>
              <Label>取出的旧桶号 (可选)</Label>
              <Input value={oldBinNumber} onChange={(e) => setOldBinNumber(e.target.value.toUpperCase())} className="h-12 mt-1 text-base" placeholder="B-20-02" />
            </div>
          )}

          {(step.step_type === "dump_site" || step.step_type === "dump_waste") && (
            <div>
              <Label>垃圾场名称 {step.step_type === "dump_site" ? '*' : '(可选)'}</Label>
              <Input value={dumpSite} onChange={(e) => setDumpSite(e.target.value)} className="h-12 mt-1 text-base" placeholder="例如 GFL Brock West" />
            </div>
          )}

          {step.requires_weigh_ticket && (
            <div>
              <Label className="text-base font-semibold">📋 磅单照片 *</Label>
              <label className="mt-2 flex flex-col items-center justify-center gap-3 min-h-[120px] rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors p-4">
                {uploading === "weigh" ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">上传中...</span>
                  </div>
                ) : weighTicketUrl ? (
                  <div className="flex flex-col items-center gap-2 w-full">
                    <div className="text-status-done font-semibold text-base flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      磅单已上传
                    </div>
                    <span className="text-xs text-muted-foreground">点击重新拍照</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Camera className="h-10 w-10 text-primary" />
                    <span className="font-medium text-base">点击拍摄磅单</span>
                    <span className="text-xs text-muted-foreground">或选择相册图片</span>
                  </div>
                )}
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "weigh")} />
              </label>
              {weighTicketUrl && (
                <div className="mt-3 rounded-lg overflow-hidden border bg-muted">
                  <img 
                    src={weighTicketUrl} 
                    alt="磅单预览" 
                    className="w-full h-auto max-h-[300px] object-contain"
                  />
                </div>
              )}
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

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t shadow-lg">
        <Button 
          onClick={() => complete.mutate()} 
          disabled={!canComplete() || complete.isPending}
          className="w-full h-14 text-base font-bold"
          size="lg"
        >
          {complete.isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              提交中...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              完成此步骤
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
