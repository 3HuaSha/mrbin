import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ORDER_TYPES, BIN_SIZES, TIME_WINDOWS, todayISO, tomorrowISO, formatPhone } from "@/lib/business";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

type OrderType = (typeof ORDER_TYPES)[number]["value"];
type BinSize = (typeof BIN_SIZES)[number];
type TimeWindow = (typeof TIME_WINDOWS)[number]["value"];

const empty = (preserveType?: OrderType) => ({
  type: preserveType ?? ("delivery" as OrderType),
  bin_size: "20" as BinSize,
  service_date: todayISO(),
  time_window: "AM" as TimeWindow,
  time_window_custom: "",
  address: "",
  customer_name: "",
  customer_phone: "",
  customer_notes: "",
  netsuite_order_id: "",
});

export function CreateOrderPage() {
  const [form, setForm] = useState(empty());
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [lastCreated, setLastCreated] = useState<string | null>(null);
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: async (payload: typeof form) => {
      const insertPayload = {
        order_number: "", // 触发器自动生成
        type: payload.type,
        bin_size: payload.type === "material" ? null : payload.bin_size,
        service_date: payload.service_date,
        time_window: payload.time_window,
        time_window_custom: payload.time_window === "custom" ? payload.time_window_custom : null,
        address: payload.address.trim(),
        customer_name: payload.customer_name.trim(),
        customer_phone: payload.customer_phone.trim(),
        customer_notes: payload.customer_notes.trim() || null,
        netsuite_order_id: payload.netsuite_order_id.trim() || null,
      };
      const { data, error } = await supabase.from("orders").insert(insertPayload).select("order_number").single();
      if (error) throw error;
      return data.order_number as string;
    },
    onSuccess: (orderNumber) => {
      setLastCreated(orderNumber);
      toast.success(`订单 ${orderNumber} 已创建`);
      const lastType = form.type;
      setForm(empty(lastType));
      setErrors({});
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const e2: Record<string, boolean> = {};
    if (!form.address.trim()) e2.address = true;
    if (!form.customer_name.trim()) e2.customer_name = true;
    if (!form.customer_phone.trim()) e2.customer_phone = true;
    if (form.time_window === "custom" && !form.time_window_custom.trim()) e2.time_window_custom = true;
    setErrors(e2);
    if (Object.keys(e2).length) return;
    submit.mutate(form);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">前台下单</h1>
        <p className="text-sm text-muted-foreground mt-1">极速填单,所有字段一屏可见。</p>
      </header>

      {lastCreated && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-status-done/30 bg-status-done/10 px-4 py-3 text-status-done">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">订单 {lastCreated} 已创建</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左栏 */}
        <div className="space-y-5 bg-card p-5 rounded-lg border">
          <div>
            <Label className="text-sm font-medium">操作类型</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {ORDER_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm({ ...form, type: t.value })}
                  className={cn(
                    "py-3 px-2 rounded-md font-semibold border-2 transition-all text-sm",
                    form.type === t.value
                      ? `${t.className} border-transparent shadow-sm`
                      : "bg-background border-border text-foreground hover:bg-accent"
                  )}
                >
                  <div className="text-lg leading-none mb-1">{t.emoji}</div>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {form.type !== "material" && (
            <div>
              <Label className="text-sm font-medium">桶尺寸</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {BIN_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm({ ...form, bin_size: s })}
                    className={cn(
                      "py-3 rounded-md font-semibold border-2 transition-all",
                      form.bin_size === s
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "bg-background border-border text-foreground hover:bg-accent"
                    )}
                  >
                    {s}yd
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-sm font-medium">服务日期</Label>
            <div className="flex gap-2 mt-2">
              <Input
                type="date"
                value={form.service_date}
                onChange={(e) => setForm({ ...form, service_date: e.target.value })}
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={() => setForm({ ...form, service_date: todayISO() })}>
                今天
              </Button>
              <Button type="button" variant="outline" onClick={() => setForm({ ...form, service_date: tomorrowISO() })}>
                明天
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">时间段</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {TIME_WINDOWS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => setForm({ ...form, time_window: w.value })}
                  className={cn(
                    "py-3 rounded-md font-semibold border-2 transition-all text-sm",
                    form.time_window === w.value
                      ? "bg-primary text-primary-foreground border-transparent"
                      : "bg-background border-border text-foreground hover:bg-accent"
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
            {form.time_window === "custom" && (
              <Input
                placeholder="例如 10:00 - 11:00"
                value={form.time_window_custom}
                onChange={(e) => setForm({ ...form, time_window_custom: e.target.value })}
                className={cn("mt-2", errors.time_window_custom && "border-destructive")}
              />
            )}
          </div>
        </div>

        {/* 右栏 */}
        <div className="space-y-5 bg-card p-5 rounded-lg border">
          <div>
            <Label className="text-sm font-medium">地址 *</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="123 Main St, Toronto, ON"
              className={cn("mt-2 text-base h-11", errors.address && "border-destructive")}
            />
          </div>
          <div>
            <Label className="text-sm font-medium">客户姓名 *</Label>
            <Input
              value={form.customer_name}
              onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              className={cn("mt-2 h-11", errors.customer_name && "border-destructive")}
            />
          </div>
          <div>
            <Label className="text-sm font-medium">客户电话 *</Label>
            <Input
              value={form.customer_phone}
              onChange={(e) => setForm({ ...form, customer_phone: formatPhone(e.target.value) })}
              placeholder="416-555-0123"
              className={cn("mt-2 h-11", errors.customer_phone && "border-destructive")}
            />
          </div>
          <div>
            <Label className="text-sm font-medium">NetSuite 订单号</Label>
            <Input
              value={form.netsuite_order_id}
              onChange={(e) => setForm({ ...form, netsuite_order_id: e.target.value })}
              placeholder="可选"
              className="mt-2"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">备注</Label>
            <Textarea
              value={form.customer_notes}
              onChange={(e) => setForm({ ...form, customer_notes: e.target.value })}
              placeholder="如:放路边、门口有狗"
              className="mt-2 min-h-[80px]"
            />
          </div>
        </div>

        <div className="lg:col-span-2">
          <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={submit.isPending}>
            {submit.isPending ? "提交中..." : "提交订单"}
          </Button>
        </div>
      </form>
    </div>
  );
}

