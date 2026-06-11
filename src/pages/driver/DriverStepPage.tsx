import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Camera, Navigation, Phone, Loader2, CheckCircle2, Clock, Coffee, Car, Utensils, TimerReset } from "lucide-react";
import { STEP_TYPE_EMOJI } from "@/lib/business";
import { toast } from "sonner";
import { useAudit } from "@/hooks/use-audit";
import { useCurrentUser } from "@/hooks/use-current-user";
import { driverBinTypeNames, driverOrderActionLabels, driverStepTypeLabels, driverText, getDriverLanguage, type DriverLanguage } from "@/lib/driver-language";

type Step = {
  id: string;
  driver_id: string;
  scheduled_date: string;
  step_number: number;
  step_type: string;
  location: string;
  status: string;
  requires_photo: boolean;
  requires_bin_number: boolean;
  requires_weigh_ticket: boolean;
  requires_weight: boolean;
  photo_url: string | null;
  pickup_photo_url: string | null;
  bin_number_reported: string | null;
  old_bin_number_reported: string | null;
  weigh_ticket_url: string | null;
  weight_kg: number | null;
  ticket_number: string | null;
  ticket_type: string | null;
  ocr_confidence: number | null;
  ocr_raw_text: string | null;
  ocr_checked: boolean;
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
  const { profile } = useCurrentUser();
  const lang = getDriverLanguage(profile);
  const t = driverText[lang];
  const [photoUrl, setPhotoUrl] = useState("");
  const [pickupPhotoUrl, setPickupPhotoUrl] = useState("");
  const [binNumber, setBinNumber] = useState("");
  const [oldBinNumber, setOldBinNumber] = useState("");
  const [weighTicketUrl, setWeighTicketUrl] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");
  const [ticketType, setTicketType] = useState("");
  const [ocrStatus, setOcrStatus] = useState<"idle" | "reading" | "found" | "missing" | "error">("idle");
  const [weight, setWeight] = useState("");
  const [dumpSite, setDumpSite] = useState("");
  const [uploading, setUploading] = useState<null | "photo" | "pickup_photo" | "weigh">(null);
  const [showActivityMenu, setShowActivityMenu] = useState(false);
  const activityOptions = getDriverActivityOptions(lang);

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

  useEffect(() => {
    if (!step) return;
    if (step.photo_url && !photoUrl) setPhotoUrl(step.photo_url);
    if (step.pickup_photo_url && !pickupPhotoUrl) setPickupPhotoUrl(step.pickup_photo_url);
    if (step.weigh_ticket_url && !weighTicketUrl) setWeighTicketUrl(step.weigh_ticket_url);
    if (step.weight_kg != null && !weight) setWeight(String(step.weight_kg));
    if (step.ticket_number && !ticketNumber) {
      setTicketNumber(step.ticket_number);
      setTicketType(step.ticket_type || "");
      setOcrStatus("found");
    }
  }, [step, photoUrl, pickupPhotoUrl, weighTicketUrl, weight, ticketNumber]);

  const order = step?.dispatch_assignments?.orders ?? null;
  const isManualStep = step?.node_type === 'step' || !order;
  const isSwapDelivery = order?.type === "swap" && (step?.step_type === "customer_delivery" || step?.step_type === "swap");
  const isDumpWaste = step?.step_type === "dump_waste";
  const isMaterialTicketStep = order?.type === "material" || step?.step_type === "load_material" || step?.step_type === "unload_material";
  const stepTypeLabels = driverStepTypeLabels[lang];

  const handleUpload = async (file: File, kind: "photo" | "pickup_photo" | "weigh") => {
    setUploading(kind);
    let compressed = file;
    try {
      compressed = await compressImage(file);
    } catch {
      toast.warning(t.compressionFailed);
    }
    const shouldOcrTicket = kind === "weigh" || (kind === "photo" && isMaterialTicketStep);
    const imageBase64 = shouldOcrTicket ? await fileToBase64(compressed) : null;
    const path = `${stepId}/${kind}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("driver-uploads").upload(path, compressed, {
      upsert: true,
      contentType: "image/jpeg",
    });
    setUploading(null);
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("driver-uploads").getPublicUrl(path);
    if (kind === "photo") {
      setPhotoUrl(data.publicUrl);
      if (isMaterialTicketStep) void runTicketOcr({ imageBase64: imageBase64 || undefined, imageUrl: data.publicUrl });
    }
    else if (kind === "pickup_photo") setPickupPhotoUrl(data.publicUrl);
    else {
      setWeighTicketUrl(data.publicUrl);
      void runTicketOcr({ imageBase64: imageBase64 || undefined, imageUrl: data.publicUrl });
    }
    toast.success(`${t.uploaded} (${Math.round(compressed.size / 1024)} KB)`);
  };

  const runTicketOcr = async (payload: { imageUrl?: string; imageBase64?: string }) => {
    setOcrStatus("reading");
    setWeight("");
    try {
      const response = await fetch("/api/ocr-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "OCR failed");

      const nextTicketNumber = typeof data.ticketNumber === "string" ? data.ticketNumber : "";
      const nextTicketType = typeof data.ticketType === "string" ? data.ticketType : "UNKNOWN";
      const nextWeightKg = typeof data.weightKg === "number" && Number.isFinite(data.weightKg) ? data.weightKg : null;

      if (nextTicketNumber) {
        setTicketNumber(nextTicketNumber);
        setTicketType(nextTicketType);
        setWeight(nextWeightKg != null ? String(nextWeightKg) : "");
        setOcrStatus("found");
        toast.success(`${t.ticketRecognized}: ${nextTicketNumber}`);
      } else {
        setOcrStatus("missing");
        toast.warning(t.ticketMissing);
      }

      const { error } = await supabase
        .from("job_steps")
        .update({
          ticket_number: nextTicketNumber || null,
          ticket_type: nextTicketType,
          ...(nextWeightKg != null ? { weight_kg: nextWeightKg } : {}),
          ocr_confidence: typeof data.confidence === "number" ? data.confidence : null,
          ocr_raw_text: typeof data.rawText === "string" ? data.rawText : null,
          ocr_checked: false,
        } as any)
        .eq("id", stepId);
      if (error) {
        if (isTicketSchemaMissing(error)) {
          toast.warning(t.ticketDbMissing);
          return;
        }
        throw error;
      }

      qc.invalidateQueries({ queryKey: ["job-step", stepId] });
      qc.invalidateQueries({ queryKey: ["driver-steps"] });
    } catch (error) {
      setOcrStatus("error");
      toast.error(error instanceof Error ? error.message : "OCR failed");
    }
  };

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read image"));
      reader.readAsDataURL(file);
    });

  const isTicketSchemaMissing = (error: unknown) => {
    const message = error instanceof Error ? error.message : String((error as any)?.message || error || "");
    return message.includes("ticket_number") && message.includes("schema cache");
  };

  const compressImage = async (file: File) => {
    const maxSide = 1600;
    const targetBytes = 320 * 1024;
    const image = await loadImage(file);
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image");
    ctx.drawImage(image, 0, 0, width, height);

    let quality = 0.72;
    let blob = await canvasToBlob(canvas, quality);
    while (blob.size > targetBytes && quality > 0.45) {
      quality = Math.max(0.45, quality - 0.08);
      blob = await canvasToBlob(canvas, quality);
    }

    if (blob.size >= file.size && file.type === "image/jpeg") return file;
    return new File([blob], replaceImageExtension(file.name), { type: "image/jpeg" });
  };

  const loadImage = (file: File) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read image"));
      };
      image.src = url;
    });

  const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Image compression failed")),
        "image/jpeg",
        quality
      );
    });

  const replaceImageExtension = (name: string) => {
    const base = name.replace(/\.[^.]+$/, "") || "upload";
    return `${base}.jpg`;
  };

  const renderGalleryUpload = (kind: "photo" | "pickup_photo" | "weigh", label = t.uploadFromPhotos) => (
    <label className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-lg border bg-background text-sm font-medium text-foreground shadow-sm cursor-pointer hover:bg-muted">
      {label}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], kind)}
      />
    </label>
  );

  const renderTicketOcrStatus = () => (
    <div className="mt-3 rounded-lg border bg-muted/50 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{t.ticketNumber}</span>
        <span className="font-mono font-bold">
          {ocrStatus === "reading" ? t.reading : ticketNumber || t.notRecognized}
        </span>
      </div>
      {ticketType && (
        <div className="mt-1 text-xs text-muted-foreground">{t.type}: {ticketType}</div>
      )}
      <div className="mt-3 flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
        <span className="text-xs font-semibold text-blue-800">{t.recognizedWeight}</span>
        <span className="font-mono text-sm font-bold text-blue-800">
          {weight ? `${weight} kg` : t.notRecognized}
        </span>
      </div>
      {!weight && ticketNumber && (
        <div className="mt-1 text-xs text-muted-foreground">
          {t.ocrWeightMissing}
        </div>
      )}
      {(ocrStatus === "missing" || ocrStatus === "error") && (
        <div className="mt-2 text-xs text-amber-700">{t.ocrReviewLater}</div>
      )}
    </div>
  );

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
      const update: Record<string, unknown> = { status: "done", completed_at: new Date().toISOString() };
      if (photoUrl) update.photo_url = photoUrl;
      if (pickupPhotoUrl) update.pickup_photo_url = pickupPhotoUrl;
      if (binNumber) update.bin_number_reported = binNumber.trim();
      if (oldBinNumber) update.old_bin_number_reported = oldBinNumber.trim();
      if (weighTicketUrl) update.weigh_ticket_url = weighTicketUrl;
      if (ticketNumber && step?.ticket_number !== undefined) update.ticket_number = ticketNumber;
      if (ticketType && step?.ticket_type !== undefined) update.ticket_type = ticketType;
      if (weight) update.weight_kg = parseFloat(weight);
      if (dumpSite) update.dump_site = dumpSite.trim();
      const { error } = await supabase.from("job_steps").update(update as any).eq("id", stepId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t.stepCompleted);
      audit({
        action: "step_complete",
        entity_type: "job_step",
        entity_id: stepId,
        entity_label: `${order?.order_number ?? "Manual"} step ${step?.step_number ?? ""}`,
        details: {
          step_type: step?.step_type,
          bin: binNumber || undefined,
          old_bin: oldBinNumber || undefined,
          weight_kg: weight ? parseFloat(weight) : undefined,
          ticket_number: ticketNumber || undefined,
          ticket_type: ticketType || undefined,
          dump_site: dumpSite || undefined,
        },
      });
      qc.invalidateQueries({ queryKey: ["driver-steps"] });
      nav({ to: "/driver" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const logActivity = useMutation({
    mutationFn: async (activityType: string) => {
      const driverId = profile?.id || step?.driver_id;
      if (!driverId || !step) throw new Error(lang === "en" ? "Driver not loaded" : "司机信息未加载");
      const { error } = await (supabase.from as any)("driver_activity_logs").insert({
        driver_id: driverId,
        scheduled_date: step.scheduled_date,
        activity_type: activityType,
        step_id: step.id,
      });
      if (error) throw error;
    },
    onSuccess: (_result, activityType) => {
      const label = activityOptions.find((option) => option.value === activityType)?.label ?? activityType;
      toast.success(`${lang === "en" ? "Recorded" : "已记录"}: ${label}`);
      setShowActivityMenu(false);
      qc.invalidateQueries({ queryKey: ["driver-activity-logs"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || !step) return <div className="p-6 text-center text-muted-foreground">{t.loading}</div>;

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
        <div className="flex-1 text-center text-sm font-semibold">{t.step} {step.step_number}</div>
        <div className="w-9" />
      </header>

      <div className="fixed bottom-24 left-3 z-30 flex items-end gap-2">
        <Button
          type="button"
          size="sm"
          className="h-11 w-11 rounded-full p-0 shadow-lg"
          aria-label={lang === "en" ? "Quick status" : "快速状态"}
          onClick={() => setShowActivityMenu((open) => !open)}
        >
          <Clock className="h-5 w-5" />
        </Button>
        {showActivityMenu ? (
          <div className="w-44 rounded-2xl border bg-card p-2 shadow-xl">
            <div className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">
              {lang === "en" ? "Quick status" : "快速状态"}
            </div>
            <div className="space-y-1">
              {activityOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant="ghost"
                    className="h-10 w-full justify-start gap-2 rounded-xl text-sm"
                    disabled={logActivity.isPending}
                    onClick={() => logActivity.mutate(option.value)}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="p-4 space-y-4">
        <div>
          <div className="text-2xl font-bold mt-1">
            {STEP_TYPE_EMOJI[step.step_type]} {isManualStep
              ? (stepTypeLabels[step.step_type] || step.step_type)
              : order
                ? `${driverOrderActionLabels[lang][order.type] ? `${driverOrderActionLabels[lang][order.type]} ` : ""}${order.bin_size ? order.bin_size + 'yd ' : ""}${order.bin_type ? driverBinTypeNames[lang][order.bin_type] || order.bin_type : (lang === "en" ? 'bin' : '桶')}`
                : (stepTypeLabels[step.step_type] || step.step_type)
            }
          </div>
          <div className="text-base mt-2">{step.location}</div>
        </div>

        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(step.location)}`}
          target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-4 font-semibold text-base"
        >
          <Navigation className="h-5 w-5" /> {t.navigate}
        </a>

        {isCustomerStep && order && (
          <div className="bg-card border rounded-xl p-4 space-y-2">
            <div className="font-semibold">{order.customer_name}</div>
            <a href={`tel:${order.customer_phone}`} className="flex items-center gap-2 text-primary font-medium">
              <Phone className="h-4 w-4" /> {order.customer_phone}
            </a>
            {order.customer_notes && (
              <div className="bg-status-progress/15 text-status-progress text-sm rounded p-2">
                {order.customer_notes}
              </div>
            )}
          </div>
        )}

        {isManualStep && step.notes && (
          <div className="bg-card border rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">{t.notes}</div>
            <div className="text-sm whitespace-pre-wrap">{step.notes}</div>
          </div>
        )}

        <div className="bg-card border rounded-xl p-4 space-y-4">
          <div className="font-semibold text-sm">{t.required}</div>

          {/* 拍照上传: dump_waste 需要"垃圾照片"(必填)+"垃圾单照片"(可选); swap 需要"送新桶"+"收旧桶"; 其他一张即可 */}
          {isDumpWaste ? (
            <>
              <div>
                <Label className="text-base font-semibold">{t.wastePhoto} *</Label>
                <label className="mt-2 flex flex-col items-center justify-center gap-3 min-h-[120px] rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors p-4">
                  {uploading === "photo" ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">{t.uploading}</span>
                    </div>
                  ) : photoUrl ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <div className="text-status-done font-semibold text-base flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        {t.wastePhoto} {t.uploaded}
                      </div>
                      <span className="text-xs text-muted-foreground">{t.tapRetake}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Camera className="h-10 w-10 text-primary" />
                      <span className="font-medium text-base">{t.takeWastePhoto}</span>
                      <span className="text-xs text-muted-foreground">{t.photoAtDumpSite}</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "photo")} />
                </label>
                {renderGalleryUpload("photo")}
                {photoUrl && (
                  <div className="mt-3 rounded-lg overflow-hidden border bg-muted">
                    <img src={photoUrl} alt="Waste preview" className="w-full h-auto max-h-[300px] object-contain" />
                  </div>
                )}
              </div>

              <div>
                <Label className="text-base font-semibold">{t.dumpTicketPhoto} ({t.optional})</Label>
                <label className="mt-2 flex flex-col items-center justify-center gap-3 min-h-[120px] rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors p-4">
                  {uploading === "weigh" ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">{t.uploading}</span>
                    </div>
                  ) : weighTicketUrl ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <div className="text-status-done font-semibold text-base flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        {t.dumpTicketPhoto} {t.uploaded}
                      </div>
                      <span className="text-xs text-muted-foreground">{t.tapRetake}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Camera className="h-10 w-10 text-primary" />
                      <span className="font-medium text-base">{t.takeDumpTicketPhoto}</span>
                      <span className="text-xs text-muted-foreground">{t.scaleTicketPhoto}</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "weigh")} />
                </label>
                {renderGalleryUpload("weigh")}
                {weighTicketUrl && (
                  <div className="mt-3 rounded-lg overflow-hidden border bg-muted">
                    <img src={weighTicketUrl} alt="Dump ticket preview" className="w-full h-auto max-h-[300px] object-contain" />
                  </div>
                )}
                {weighTicketUrl && renderTicketOcrStatus()}
              </div>
            </>
          ) : isSwapDelivery ? (
            <>
              <div>
                <Label className="text-base font-semibold">{t.newBinPhoto} {step.requires_photo && '*'}</Label>
                <label className="mt-2 flex flex-col items-center justify-center gap-3 min-h-[120px] rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors p-4">
                  {uploading === "photo" ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">{t.uploading}</span>
                    </div>
                  ) : photoUrl ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <div className="text-status-done font-semibold text-base flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        {t.newBinPhoto} {t.uploaded}
                      </div>
                      <span className="text-xs text-muted-foreground">{t.tapRetake}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Camera className="h-10 w-10 text-primary" />
                      <span className="font-medium text-base">{t.takeNewBinPhoto}</span>
                      <span className="text-xs text-muted-foreground">{t.binDelivered}</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "photo")} />
                </label>
                {renderGalleryUpload("photo")}
                {photoUrl && (
                  <div className="mt-3 rounded-lg overflow-hidden border bg-muted">
                    <img src={photoUrl} alt="New bin preview" className="w-full h-auto max-h-[300px] object-contain" />
                  </div>
                )}
              </div>

              <div>
                <Label className="text-base font-semibold">{t.oldBinPhoto} ({t.optional})</Label>
                <label className="mt-2 flex flex-col items-center justify-center gap-3 min-h-[120px] rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors p-4">
                  {uploading === "pickup_photo" ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">{t.uploading}</span>
                    </div>
                  ) : pickupPhotoUrl ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <div className="text-status-done font-semibold text-base flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        {t.oldBinPhoto} {t.uploaded}
                      </div>
                      <span className="text-xs text-muted-foreground">{t.tapRetake}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Camera className="h-10 w-10 text-primary" />
                      <span className="font-medium text-base">{t.takeOldBinPhoto}</span>
                      <span className="text-xs text-muted-foreground">{t.binRemoved}</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "pickup_photo")} />
                </label>
                {renderGalleryUpload("pickup_photo")}
                {pickupPhotoUrl && (
                  <div className="mt-3 rounded-lg overflow-hidden border bg-muted">
                    <img src={pickupPhotoUrl} alt="Old bin preview" className="w-full h-auto max-h-[300px] object-contain" />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div>
              <Label className="text-base font-semibold">{t.photoUpload} {step.requires_photo && '*'}</Label>
              <label className="mt-2 flex flex-col items-center justify-center gap-3 min-h-[120px] rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors p-4">
                {uploading === "photo" ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">{t.uploading}</span>
                  </div>
                ) : photoUrl ? (
                  <div className="flex flex-col items-center gap-2 w-full">
                    <div className="text-status-done font-semibold text-base flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      {t.photoUploaded}
                    </div>
                    <span className="text-xs text-muted-foreground">{t.tapRetake}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Camera className="h-10 w-10 text-primary" />
                    <span className="font-medium text-base">{t.takePhoto}</span>
                    <span className="text-xs text-muted-foreground">{t.orUploadFromPhotos}</span>
                  </div>
                )}
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "photo")} />
              </label>
              {renderGalleryUpload("photo")}
              {photoUrl && (
                <div className="mt-3 rounded-lg overflow-hidden border bg-muted">
                  <img
                    src={photoUrl}
                    alt="Preview"
                    className="w-full h-auto max-h-[300px] object-contain"
                  />
                </div>
              )}
              {photoUrl && isMaterialTicketStep && renderTicketOcrStatus()}
            </div>
          )}

          {/* 桶号输入 - 所有步骤都可以填 (可选) */}
          <div>
            <Label>{isSwapDelivery ? t.newBinNumber : t.binNumber}</Label>
            <Input value={binNumber} onChange={(e) => setBinNumber(e.target.value.toUpperCase())} className="h-12 mt-1 text-base" placeholder="B-20-01" />
          </div>

          {isSwapDelivery && (
            <div>
              <Label>{t.oldBinNumber}</Label>
              <Input value={oldBinNumber} onChange={(e) => setOldBinNumber(e.target.value.toUpperCase())} className="h-12 mt-1 text-base" placeholder="B-20-02" />
            </div>
          )}

          {(step.step_type === "dump_site" || step.step_type === "dump_waste") && (
            <div>
              <Label>{t.dumpSiteName} {step.step_type === "dump_site" ? "*" : `(${t.optional})`}</Label>
              <Input value={dumpSite} onChange={(e) => setDumpSite(e.target.value)} className="h-12 mt-1 text-base" placeholder="e.g. GFL Brock West" />
            </div>
          )}

          {step.requires_weigh_ticket && (
            <div>
              <Label className="text-base font-semibold">{t.scaleTicketPhoto} *</Label>
              <label className="mt-2 flex flex-col items-center justify-center gap-3 min-h-[120px] rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors p-4">
                {uploading === "weigh" ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">{t.uploading}</span>
                  </div>
                ) : weighTicketUrl ? (
                  <div className="flex flex-col items-center gap-2 w-full">
                    <div className="text-status-done font-semibold text-base flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      {t.scaleTicketPhoto} {t.uploaded}
                    </div>
                    <span className="text-xs text-muted-foreground">{t.tapRetake}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Camera className="h-10 w-10 text-primary" />
                    <span className="font-medium text-base">{t.takeScaleTicketPhoto}</span>
                    <span className="text-xs text-muted-foreground">{t.orUploadFromPhotos}</span>
                  </div>
                )}
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "weigh")} />
              </label>
              {renderGalleryUpload("weigh")}
              {weighTicketUrl && (
                <div className="mt-3 rounded-lg overflow-hidden border bg-muted">
                  <img 
                    src={weighTicketUrl} 
                    alt="Scale ticket preview"
                    className="w-full h-auto max-h-[300px] object-contain"
                  />
                </div>
              )}
              {weighTicketUrl && !isDumpWaste && renderTicketOcrStatus()}
            </div>
          )}

          {step.requires_weight && (
            <div>
              <Label>{t.weight} *</Label>
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
              {t.submitting}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              {t.completeStep}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

function getDriverActivityOptions(lang: DriverLanguage) {
  const zh = lang === "zh";
  return [
    { value: "waiting_customer", label: zh ? "等客户" : "Waiting customer", icon: Coffee },
    { value: "waiting_car_move", label: zh ? "等挪车" : "Waiting car move", icon: Car },
    { value: "lunch", label: zh ? "吃饭" : "Lunch", icon: Utensils },
    { value: "traffic", label: zh ? "堵车" : "Traffic", icon: TimerReset },
  ];
}
