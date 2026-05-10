import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  time_range: null as [number, number] | null, // 初始为空
  customer_contact: "", // 合并姓名和电话
  address: "",
  customer_notes: "",
});

export function CreateOrderPage() {
  const [form, setForm] = useState(empty());
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [lastCreated, setLastCreated] = useState<string | null>(null);
  const [swapLinkedOrderId, setSwapLinkedOrderId] = useState<string | null>(null);
  const [showSwapPicker, setShowSwapPicker] = useState(false);
  const qc = useQueryClient();
  const audit = useAudit();

  // 当是换桶单且输入了地址时,查找同地址同尺寸的未回收桶/未完成的送桶单
  const { data: activeDeliveriesAtAddress = [] } = useQuery({
    queryKey: ["active-deliveries-at", form.address, form.bin_size],
    enabled: form.type === "swap" && form.address.trim().length >= 3,
    queryFn: async () => {
      const addr = form.address.trim();
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, address, bin_size, bin_type, service_date, customer_name, status, linked_order_id")
        .eq("type", "delivery")
        .ilike("address", `%${addr}%`)
        .eq("bin_size", form.bin_size)
        .is("linked_order_id", null)  // 只显示还没关联收桶单的
        .order("service_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 用户改类型或地址时重置关联
  useEffect(() => {
    if (form.type !== "swap") {
      setSwapLinkedOrderId(null);
      setShowSwapPicker(false);
    }
  }, [form.type]);

  useEffect(() => {
    if (form.type === "swap" && form.address.trim().length >= 3) {
      setShowSwapPicker(true);
    } else {
      setShowSwapPicker(false);
    }
    setSwapLinkedOrderId(null);
  }, [form.address, form.bin_size]);

  // 格式化时间范围为字符串
  const formatTimeRange = (slot: TimeSlot, range: [number, number] | null): string => {
    if (slot === "anytime") return "anytime";
    if (!range) return slot; // 如果没有选择范围，返回AM或PM
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
      // 从customer_contact中分离姓名和电话
      const contactParts = payload.customer_contact.trim().split(/\s+/);
      const phone = contactParts.find(part => /\d{3}[-.]?\d{3}[-.]?\d{4}/.test(part)) || "";
      const name = contactParts.filter(part => part !== phone).join(" ");
      
      // 处理时间窗口
      let timeWindow: string;
      let timeWindowCustom: string | null = null;
      
      if (payload.time_slot === "anytime") {
        timeWindow = "AM"; // 默认使用AM
        timeWindowCustom = "anytime";
      } else if (payload.time_range) {
        // 如果用户选择了自定义时间范围
        timeWindow = "custom";
        timeWindowCustom = formatTimeRange(payload.time_slot, payload.time_range);
      } else {
        // 如果只选择了AM/PM，没有具体范围
        timeWindow = payload.time_slot;
        timeWindowCustom = null;
      }
      
      const insertPayload = {
        order_number: "", // 触发器自动生成
        type: payload.type,
        bin_size: payload.type === "material" ? null : payload.bin_size,
        bin_type: payload.type === "material" ? null : payload.bin_type,
        service_date: payload.service_date,
        time_window: timeWindow,
        time_window_custom: timeWindowCustom,
        address: payload.address.trim(),
        customer_name: name || payload.customer_contact.trim(),
        customer_phone: phone,
        customer_notes: payload.customer_notes.trim() || null,
        netsuite_order_id: null,
      };

      // 换桶订单: 创建 delivery (新桶) + 在原 delivery 订单号下新增 pickup 记录, 互相关联
      if (payload.type === "swap") {
        if (!swapLinkedOrderId) {
          throw new Error("请先选择同地址待回收的桶");
        }
        // 查原送桶单拿到 order_number
        const { data: linkedOrder, error: linkedErr } = await supabase
          .from("orders")
          .select("order_number")
          .eq("id", swapLinkedOrderId)
          .single();
        if (linkedErr || !linkedOrder) throw new Error("无法找到关联的送桶订单");

        // 1) 创建 delivery 新桶 (type 改为 delivery, 触发器生成新单号)
        const { data: newDelivery, error: dErr } = await supabase
          .from("orders")
          .insert({ ...insertPayload, type: "delivery" })
          .select("id, order_number, type, address, customer_name")
          .single();
        if (dErr) throw dErr;

        // 2) 创建 pickup 记录,沿用旧单号 (order_number + type=pickup 复合唯一)
        const { data: pickupRow, error: pErr } = await supabase
          .from("orders")
          .insert({
            ...insertPayload,
            type: "pickup",
            order_number: linkedOrder.order_number,
            linked_order_id: newDelivery.id,
          })
          .select("id")
          .single();
        if (pErr) throw pErr;

        // 3) 回填 delivery 的 linked_order_id 指向 pickup
        await supabase.from("orders").update({ linked_order_id: pickupRow.id }).eq("id", newDelivery.id);

        return newDelivery;
      }

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
      setSwapLinkedOrderId(null);
      setShowSwapPicker(false);
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const e2: Record<string, boolean> = {};
    if (!form.address.trim()) e2.address = true;
    if (!form.customer_contact.trim()) e2.customer_contact = true;
    setErrors(e2);
    if (Object.keys(e2).length) return;
    if (form.type === "swap" && !swapLinkedOrderId) {
      toast.error("换桶订单必须选择同地址待回收的桶对应订单");
      return;
    }
    submit.mutate(form);
  };

  // 切换时间段时重置时间范围
  const handleTimeSlotChange = (slot: TimeSlot) => {
    setForm({ ...form, time_slot: slot, time_range: null });
  };

  // 格式化小时显示
  const formatHour = (h: number) => {
    if (h === 12) return "12PM";
    if (h > 12) return `${h - 12}PM`;
    return `${h}AM`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-50 p-3">
      <div className="max-w-6xl mx-auto">
        {lastCreated && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border-2 border-green-500 bg-green-50 px-4 py-2 shadow-lg animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="font-bold text-green-700">订单 {lastCreated} 已创建！</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* 第一行：服务类型 */}
          <div className="bg-white rounded-xl shadow-md p-4">
            <h2 className="text-base font-bold mb-3 text-gray-800">服务类型</h2>
            <div className="grid grid-cols-4 gap-2">
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

          {/* 第二行：两列布局 - 左边桶信息，右边日期时间 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 左列：桶尺寸和类型 */}
            {form.type !== "material" && (
              <div className="bg-white rounded-xl shadow-md p-4">
                <h2 className="text-base font-bold mb-3 text-gray-800">桶尺寸和类型</h2>
                <div className="flex gap-2 mb-3">
                  {BIN_SIZES.filter(s => s !== "30").map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm({ ...form, bin_size: s })}
                      className={cn(
                        "flex-1 py-2 rounded-lg font-bold border-3 transition-all text-base shadow-sm hover:scale-105",
                        form.bin_size === s
                          ? "bg-orange-500 text-white border-transparent shadow-md scale-105"
                          : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                      )}
                    >
                      {s}yd
                    </button>
                  ))}
                  {form.type === "swap" && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, bin_size: "30" })}
                      className={cn(
                        "w-16 py-2 rounded-lg font-bold border-3 transition-all text-sm shadow-sm hover:scale-105",
                        form.bin_size === "30"
                          ? "bg-orange-500 text-white border-transparent shadow-md scale-105"
                          : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                      )}
                    >
                      30yd
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {BIN_TYPES.map((bt) => {
                    const isSpecialType = ["brick", "soil", "cement", "asphalt"].includes(bt.value);
                    if (isSpecialType && form.bin_size !== "14") return null;
                    
                    return (
                      <button
                        key={bt.value}
                        type="button"
                        onClick={() => setForm({ ...form, bin_type: bt.value })}
                        className={cn(
                          "py-2 px-1 rounded-lg font-bold border-3 transition-all text-xs shadow-sm hover:scale-105",
                          form.bin_type === bt.value
                            ? "bg-blue-500 text-white border-transparent shadow-md scale-105"
                            : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                        )}
                      >
                        <div className="text-lg mb-0.5">{bt.emoji}</div>
                        <div className="text-[10px]">{bt.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 右列：日期和时间 */}
            <div className="bg-white rounded-xl shadow-md p-4">
              <h2 className="text-base font-bold mb-3 text-gray-800">日期和时间</h2>
              <div className="flex gap-2 mb-3">
                <Button 
                  type="button" 
                  size="sm"
                  variant={form.service_date === todayISO() ? "default" : "outline"}
                  onClick={() => setForm({ ...form, service_date: todayISO() })}
                  className="flex-1 h-9 text-sm font-bold rounded-lg"
                >
                  今天
                </Button>
                <Button 
                  type="button" 
                  size="sm"
                  variant={form.service_date === tomorrowISO() ? "default" : "outline"}
                  onClick={() => setForm({ ...form, service_date: tomorrowISO() })}
                  className="flex-1 h-9 text-sm font-bold rounded-lg"
                >
                  明天
                </Button>
                <Input
                  type="date"
                  value={form.service_date}
                  onChange={(e) => setForm({ ...form, service_date: e.target.value })}
                  className="flex-1 h-9 text-sm rounded-lg border-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => handleTimeSlotChange("AM")}
                  className={cn(
                    "py-2 rounded-lg font-bold border-3 transition-all text-sm shadow-sm hover:scale-105",
                    form.time_slot === "AM"
                      ? "bg-yellow-400 text-gray-900 border-transparent shadow-md scale-105"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  )}
                >
                  <div className="text-lg mb-0.5">🌅</div>
                  <div className="text-xs">上午</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleTimeSlotChange("PM")}
                  className={cn(
                    "py-2 rounded-lg font-bold border-3 transition-all text-sm shadow-sm hover:scale-105",
                    form.time_slot === "PM"
                      ? "bg-orange-400 text-gray-900 border-transparent shadow-md scale-105"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  )}
                >
                  <div className="text-lg mb-0.5">🌆</div>
                  <div className="text-xs">下午</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleTimeSlotChange("anytime")}
                  className={cn(
                    "py-2 rounded-lg font-bold border-3 transition-all text-sm shadow-sm hover:scale-105",
                    form.time_slot === "anytime"
                      ? "bg-purple-400 text-white border-transparent shadow-md scale-105"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  )}
                >
                  <div className="text-lg mb-0.5">🕐</div>
                  <div className="text-xs">任意</div>
                </button>
              </div>

              {/* 自定义时间范围选择器 - 可选 */}
              {form.time_slot !== "anytime" && (
                <div className="bg-gray-50 rounded-lg p-3 border-2 border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-700">
                      {form.time_range ? "拖动调整时间范围（可选）" : "拖动创建具体时间范围（可选）"}
                    </span>
                    {form.time_range && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-orange-600">
                          {formatHour(form.time_range[0])} - {formatHour(form.time_range[1])}
                        </span>
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, time_range: null })}
                          className="text-xs text-red-600 hover:text-red-700 underline"
                        >
                          清除
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* 小时刻度显示 */}
                  <div className="relative mb-2">
                    <div className="flex justify-between text-[10px] font-semibold text-gray-600 px-1">
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
                  
                  {/* 自定义时间轴 */}
                  <div 
                    className="relative h-12 bg-white rounded-lg border-2 border-gray-300 cursor-crosshair"
                    onMouseDown={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const percent = x / rect.width;
                      const minHour = form.time_slot === "AM" ? 7 : 12;
                      const maxHour = form.time_slot === "AM" ? 13 : 19;
                      const hour = Math.round(minHour + percent * (maxHour - minHour));
                      const clampedHour = Math.max(minHour, Math.min(maxHour, hour));
                      
                      // 开始创建新范围
                      setForm({ ...form, time_range: [clampedHour, clampedHour] });
                      
                      const handleMouseMove = (moveEvent: MouseEvent) => {
                        const moveX = moveEvent.clientX - rect.left;
                        const movePercent = moveX / rect.width;
                        const moveHour = Math.round(minHour + movePercent * (maxHour - minHour));
                        const clampedMoveHour = Math.max(minHour, Math.min(maxHour, moveHour));
                        
                        setForm(prev => ({
                          ...prev,
                          time_range: [
                            Math.min(clampedHour, clampedMoveHour),
                            Math.max(clampedHour, clampedMoveHour)
                          ]
                        }));
                      };
                      
                      const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                      };
                      
                      document.addEventListener('mousemove', handleMouseMove);
                      document.addEventListener('mouseup', handleMouseUp);
                    }}
                  >
                    {/* 显示选中的时间范围 */}
                    {form.time_range && (
                      <>
                        {/* 范围条 */}
                        <div
                          className="absolute top-0 bottom-0 bg-orange-400 opacity-50 rounded"
                          style={{
                            left: `${((form.time_range[0] - (form.time_slot === "AM" ? 7 : 12)) / (form.time_slot === "AM" ? 6 : 7)) * 100}%`,
                            width: `${((form.time_range[1] - form.time_range[0]) / (form.time_slot === "AM" ? 6 : 7)) * 100}%`
                          }}
                        />
                        
                        {/* 左边界拖动手柄 */}
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-4 h-8 bg-orange-600 rounded cursor-ew-resize shadow-md border-2 border-white hover:bg-orange-700 z-10"
                          style={{
                            left: `calc(${((form.time_range[0] - (form.time_slot === "AM" ? 7 : 12)) / (form.time_slot === "AM" ? 6 : 7)) * 100}% - 8px)`
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                            
                            const handleMouseMove = (moveEvent: MouseEvent) => {
                              const x = moveEvent.clientX - rect.left;
                              const percent = x / rect.width;
                              const minHour = form.time_slot === "AM" ? 7 : 12;
                              const maxHour = form.time_slot === "AM" ? 13 : 19;
                              const hour = Math.round(minHour + percent * (maxHour - minHour));
                              const clampedHour = Math.max(minHour, Math.min(form.time_range![1], hour));
                              
                              setForm(prev => ({
                                ...prev,
                                time_range: [clampedHour, prev.time_range![1]]
                              }));
                            };
                            
                            const handleMouseUp = () => {
                              document.removeEventListener('mousemove', handleMouseMove);
                              document.removeEventListener('mouseup', handleMouseUp);
                            };
                            
                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                          }}
                        />
                        
                        {/* 右边界拖动手柄 */}
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-4 h-8 bg-orange-600 rounded cursor-ew-resize shadow-md border-2 border-white hover:bg-orange-700 z-10"
                          style={{
                            left: `calc(${((form.time_range[1] - (form.time_slot === "AM" ? 7 : 12)) / (form.time_slot === "AM" ? 6 : 7)) * 100}% - 8px)`
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                            
                            const handleMouseMove = (moveEvent: MouseEvent) => {
                              const x = moveEvent.clientX - rect.left;
                              const percent = x / rect.width;
                              const minHour = form.time_slot === "AM" ? 7 : 12;
                              const maxHour = form.time_slot === "AM" ? 13 : 19;
                              const hour = Math.round(minHour + percent * (maxHour - minHour));
                              const clampedHour = Math.max(form.time_range![0], Math.min(maxHour, hour));
                              
                              setForm(prev => ({
                                ...prev,
                                time_range: [prev.time_range![0], clampedHour]
                              }));
                            };
                            
                            const handleMouseUp = () => {
                              document.removeEventListener('mousemove', handleMouseMove);
                              document.removeEventListener('mouseup', handleMouseUp);
                            };
                            
                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                          }}
                        />
                      </>
                    )}
                  </div>
                  
                  {!form.time_range && (
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      可选：在时间轴上拖动创建具体时间范围，或直接提交使用{form.time_slot === "AM" ? "上午" : "下午"}时段
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 第三行：客户信息 - 单行布局 */}
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
                {/* 换桶: 显示同地址待回收桶的订单 */}
                {form.type === "swap" && showSwapPicker && (
                  <div className="mt-2 p-3 bg-blue-50 border-2 border-blue-200 rounded-lg">
                    <div className="text-xs font-bold text-blue-800 mb-2">
                      🔵 选择对应待回收桶的订单号 ({form.bin_size}yd)
                    </div>
                    {activeDeliveriesAtAddress.length === 0 ? (
                      <div className="text-xs text-gray-500 italic">
                        未找到该地址 {form.bin_size}yd 的现场桶。请确认地址与尺寸。
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {activeDeliveriesAtAddress.map((o: any) => {
                          const isSel = swapLinkedOrderId === o.id;
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => setSwapLinkedOrderId(isSel ? null : o.id)}
                              className={cn(
                                "w-full flex items-center justify-between px-3 py-2 rounded border-2 text-left transition-all",
                                isSel
                                  ? "bg-blue-500 text-white border-blue-600 shadow"
                                  : "bg-white border-gray-200 hover:border-blue-400"
                              )}
                            >
                              <div className="min-w-0">
                                <div className="font-mono font-bold text-sm">{o.order_number}</div>
                                <div className={cn("text-[10px] truncate", isSel ? "text-blue-100" : "text-gray-500")}>
                                  {o.service_date} · {o.customer_name} · {o.bin_size}yd
                                </div>
                              </div>
                              {isSel && <span className="text-xs font-bold">✓ 已选</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* 联系方式和备注一行 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-bold text-gray-700 mb-1 block">姓名和电话 *</Label>
                  <Input
                    value={form.customer_contact}
                    onChange={(e) => setForm({ ...form, customer_contact: e.target.value })}
                    placeholder="张三 416-555-0123"
                    className={cn("h-10 text-sm rounded-lg border-2", errors.customer_contact && "border-red-500")}
                  />
                </div>
                <div>
                  <Label className="text-sm font-bold text-gray-700 mb-1 block">备注</Label>
                  <Input
                    value={form.customer_notes}
                    onChange={(e) => setForm({ ...form, customer_notes: e.target.value })}
                    placeholder="如:放路边、门口有狗"
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
