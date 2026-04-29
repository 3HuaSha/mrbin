import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { ORDER_TYPES, todayISO, tomorrowISO, formatPhone } from "@/lib/business";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { useAudit } from "@/hooks/use-audit";

type OrderType = "delivery" | "pickup" | "swap" | "material";
type BinSize = "14" | "20" | "30" | "40";
type BinType = "garbage" | "brick" | "soil" | "cement" | "asphalt";
type TimeSlot = "AM" | "PM" | "anytime";

const BIN_SIZES: BinSize[] = ["14", "20", "30", "40"];
const BIN_TYPES = [
  { value: "garbage" as BinType, label: "垃圾桶", emoji: "🗑️" },
  { value: "brick" as BinType, label: "砖桶", emoji: "🧱" },
  { value: "soil" as BinType, label: "土桶", emoji: "🏔️" },
  { value: "cement" as BinType, label: "水泥桶", emoji: "🏗️" },
  { value: "asphalt" as BinType, label: "沥青桶", emoji: "🛣️" },
];

const empty = (preserveType?: OrderType) => ({
  type: preserveType ?? ("delivery" as OrderType),
  bin_size: "20" as BinSize,
  bin_type: "garbage" as BinType,
  service_date: todayISO(),
  time_slot: "AM" as TimeSlot,
  time_range: [7, 13] as [number, number], // AM: 7-13, PM: 12-19
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
  const audit = useAudit();

  // 格式化时间范围为字符串
  const formatTimeRange = (slot: TimeSlot, range: [number, number]): string => {
    if (slot === "anytime") return "anytime";
    const [start, end] = range;
    const formatHour = (h: number) => {
      if (h === 12) return "12PM";
      if (h > 12) return `${h - 12}PM`;
      return `${h}AM`;
    };
    return `${formatHour(start)}-${formatHour(end)}`;
  };

  const submit = useMutation({
    mutationFn: async (payload: typeof form) => {
      const timeWindow = formatTimeRange(payload.time_slot, payload.time_range);
      
      const insertPayload = {
        order_number: "", // 触发器自动生成
        type: payload.type,
        bin_size: payload.type === "material" ? null : payload.bin_size,
        service_date: payload.service_date,
        time_window: timeWindow,
        time_window_custom: null,
        address: payload.address.trim(),
        customer_name: payload.customer_name.trim(),
        customer_phone: payload.customer_phone.trim(),
        customer_notes: payload.customer_notes.trim() || null,
        netsuite_order_id: payload.netsuite_order_id.trim() || null,
      };
      const { data, error } = await supabase.from("orders").insert(insertPayload).select("id,order_number,type,address,customer_name").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (created) => {
      setLastCreated(created.order_number);
      toast.success(`订单 ${created.order_number} 已创建`);
      audit({
        action: "order_create",
        entity_type: "order",
        entity_id: created.id,
        entity_label: created.order_number,
        details: { type: created.type, address: created.address, customer: created.customer_name },
      });
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
    setErrors(e2);
    if (Object.keys(e2).length) return;
    submit.mutate(form);
  };

  // 切换时间段时更新时间范围
  const handleTimeSlotChange = (slot: TimeSlot) => {
    let newRange: [number, number] = [7, 13];
    if (slot === "PM") newRange = [12, 19];
    setForm({ ...form, time_slot: slot, time_range: newRange });
  };

  // 格式化小时显示
  const formatHour = (h: number) => {
    if (h === 12) return "12PM";
    if (h > 12) return `${h - 12}PM`;
    return `${h}AM`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50 p-3">
      <div className="max-w-4xl mx-auto">
        {lastCreated && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border-2 border-green-500 bg-green-50 px-4 py-2 shadow-lg animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="font-bold text-green-700">订单 {lastCreated} 已创建！</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* 操作类型 - 紧凑按钮 */}
          <div className="bg-white rounded-xl shadow-md p-4">
            <h2 className="text-base font-bold mb-3 text-gray-800">选择服务类型</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {ORDER_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm({ ...form, type: t.value })}
                  className={cn(
                    "py-3 px-3 rounded-lg font-bold border-3 transition-all text-sm shadow-sm hover:scale-105",
                    form.type === t.value
                      ? `${t.className} border-transparent shadow-md scale-105`
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  )}
                >
                  <div className="text-2xl mb-1">{t.emoji}</div>
                  <div>{t.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 桶尺寸和类型 */}
          {form.type !== "material" && (
            <div className="bg-white rounded-xl shadow-md p-4">
              <h2 className="text-base font-bold mb-3 text-gray-800">选择桶尺寸和类型</h2>
              <div className="flex gap-2 mb-4">
                {/* 常规尺寸 14, 20, 40 */}
                {BIN_SIZES.filter(s => s !== "30").map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm({ ...form, bin_size: s })}
                    className={cn(
                      "flex-1 py-3 rounded-lg font-bold border-3 transition-all text-base shadow-sm hover:scale-105",
                      form.bin_size === s
                        ? "bg-orange-500 text-white border-transparent shadow-md scale-105"
                        : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                    )}
                  >
                    {s}yd
                  </button>
                ))}
                {/* 30yd 只在换桶时显示，且更小 */}
                {form.type === "swap" && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, bin_size: "30" })}
                    className={cn(
                      "w-20 py-3 rounded-lg font-bold border-3 transition-all text-sm shadow-sm hover:scale-105",
                      form.bin_size === "30"
                        ? "bg-orange-500 text-white border-transparent shadow-md scale-105"
                        : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                    )}
                  >
                    30yd
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {BIN_TYPES.map((bt) => {
                  // 只有14yd时显示特殊桶类型
                  const isSpecialType = ["brick", "soil", "cement", "asphalt"].includes(bt.value);
                  if (isSpecialType && form.bin_size !== "14") return null;
                  
                  return (
                    <button
                      key={bt.value}
                      type="button"
                      onClick={() => setForm({ ...form, bin_type: bt.value })}
                      className={cn(
                        "py-2 px-2 rounded-lg font-bold border-3 transition-all text-xs shadow-sm hover:scale-105",
                        form.bin_type === bt.value
                          ? "bg-blue-500 text-white border-transparent shadow-md scale-105"
                          : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                      )}
                    >
                      <div className="text-xl mb-0.5">{bt.emoji}</div>
                      <div>{bt.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 服务日期和时间段合并 */}
          <div className="bg-white rounded-xl shadow-md p-4">
            <h2 className="text-base font-bold mb-3 text-gray-800">选择日期和时间</h2>
            <div className="flex gap-2 mb-3">
              <Button 
                type="button" 
                size="sm"
                variant={form.service_date === todayISO() ? "default" : "outline"}
                onClick={() => setForm({ ...form, service_date: todayISO() })}
                className="flex-1 h-10 text-sm font-bold rounded-lg"
              >
                今天
              </Button>
              <Button 
                type="button" 
                size="sm"
                variant={form.service_date === tomorrowISO() ? "default" : "outline"}
                onClick={() => setForm({ ...form, service_date: tomorrowISO() })}
                className="flex-1 h-10 text-sm font-bold rounded-lg"
              >
                明天
              </Button>
              <Input
                type="date"
                value={form.service_date}
                onChange={(e) => setForm({ ...form, service_date: e.target.value })}
                className="flex-1 h-10 text-sm rounded-lg border-2"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <button
                type="button"
                onClick={() => handleTimeSlotChange("AM")}
                className={cn(
                  "py-3 rounded-lg font-bold border-3 transition-all text-sm shadow-sm hover:scale-105",
                  form.time_slot === "AM"
                    ? "bg-yellow-400 text-gray-900 border-transparent shadow-md scale-105"
                    : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                )}
              >
                <div className="text-xl mb-1">🌅</div>
                <div>上午</div>
              </button>
              <button
                type="button"
                onClick={() => handleTimeSlotChange("PM")}
                className={cn(
                  "py-3 rounded-lg font-bold border-3 transition-all text-sm shadow-sm hover:scale-105",
                  form.time_slot === "PM"
                    ? "bg-orange-400 text-gray-900 border-transparent shadow-md scale-105"
                    : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                )}
              >
                <div className="text-xl mb-1">🌆</div>
                <div>下午</div>
              </button>
              <button
                type="button"
                onClick={() => handleTimeSlotChange("anytime")}
                className={cn(
                  "py-3 rounded-lg font-bold border-3 transition-all text-sm shadow-sm hover:scale-105",
                  form.time_slot === "anytime"
                    ? "bg-purple-400 text-white border-transparent shadow-md scale-105"
                    : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                )}
              >
                <div className="text-xl mb-1">🕐</div>
                <div>任意</div>
              </button>
            </div>

            {/* 改进的时间范围滑块 - 带小时刻度 */}
            {form.time_slot !== "anytime" && (
              <div className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-gray-700">具体时间范围</span>
                  <span className="text-base font-bold text-orange-600">
                    {formatHour(form.time_range[0])} - {formatHour(form.time_range[1])}
                  </span>
                </div>
                
                {/* 小时刻度显示 */}
                <div className="relative mb-2">
                  <div className="flex justify-between text-xs font-semibold text-gray-600">
                    {Array.from(
                      { length: (form.time_slot === "AM" ? 7 : 8) },
                      (_, i) => {
                        const hour = form.time_slot === "AM" ? 7 + i : 12 + i;
                        return (
                          <span key={hour} className="flex-1 text-center">
                            {formatHour(hour)}
                          </span>
                        );
                      }
                    )}
                  </div>
                </div>
                
                <Slider
                  min={form.time_slot === "AM" ? 7 : 12}
                  max={form.time_slot === "AM" ? 13 : 19}
                  step={1}
                  value={form.time_range}
                  onValueChange={(value) => setForm({ ...form, time_range: value as [number, number] })}
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* 客户信息 - 优化布局 */}
          <div className="bg-white rounded-xl shadow-md p-4">
            <h2 className="text-base font-bold mb-3 text-gray-800">客户信息</h2>
            <div className="space-y-3">
              {/* 地址单独一行 */}
              <div>
                <Label className="text-sm font-bold text-gray-700 mb-1 block">地址 *</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="123 Main St, Toronto, ON"
                  className={cn("h-10 text-sm rounded-lg border-2", errors.address && "border-red-500")}
                />
              </div>
              
              {/* 姓名和电话一行 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-bold text-gray-700 mb-1 block">客户姓名 *</Label>
                  <Input
                    value={form.customer_name}
                    onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                    className={cn("h-10 text-sm rounded-lg border-2", errors.customer_name && "border-red-500")}
                  />
                </div>
                <div>
                  <Label className="text-sm font-bold text-gray-700 mb-1 block">客户电话 *</Label>
                  <Input
                    value={form.customer_phone}
                    onChange={(e) => setForm({ ...form, customer_phone: formatPhone(e.target.value) })}
                    placeholder="416-555-0123"
                    className={cn("h-10 text-sm rounded-lg border-2", errors.customer_phone && "border-red-500")}
                  />
                </div>
              </div>
              
              {/* 备注和NetSuite订单号一行 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-bold text-gray-700 mb-1 block">备注</Label>
                  <Input
                    value={form.customer_notes}
                    onChange={(e) => setForm({ ...form, customer_notes: e.target.value })}
                    placeholder="如:放路边、门口有狗"
                    className="h-10 text-sm rounded-lg border-2"
                  />
                </div>
                <div>
                  <Label className="text-sm font-bold text-gray-700 mb-1 block">NetSuite 订单号</Label>
                  <Input
                    value={form.netsuite_order_id}
                    onChange={(e) => setForm({ ...form, netsuite_order_id: e.target.value })}
                    placeholder="可选"
                    className="h-10 text-sm rounded-lg border-2"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 提交按钮 */}
          <Button 
            type="submit" 
            className="w-full h-12 text-lg font-bold rounded-xl shadow-lg hover:scale-105 transition-transform bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600" 
            disabled={submit.isPending}
          >
            {submit.isPending ? "提交中..." : "✓ 提交订单"}
          </Button>
        </form>
      </div>
    </div>
  );
}
