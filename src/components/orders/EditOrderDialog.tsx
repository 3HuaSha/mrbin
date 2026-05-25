import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  ORDER_TYPES, 
  ORDER_STATUS_LABEL 
} from "@/lib/business";
import { Order } from "@/types/dispatch";

interface EditOrderDialogProps {
  order: Order;
  onClose: () => void;
}

export function EditOrderDialog({ order, onClose }: EditOrderDialogProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    type: order.type,
    bin_size: order.bin_size || "",
    bin_type: order.bin_type || "",
    time_window: order.time_window,
    time_window_custom: order.time_window_custom || "",
    address: order.address,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    customer_notes: order.customer_notes || "",
    netsuite_order_id: order.netsuite_order_id || "",
    service_date: order.service_date,
    status: order.status,
    bin_number: "",
  });

  // 查询该订单关联的桶号 (从 job_steps)
  const { data: existingBinNumber } = useQuery({
    queryKey: ["order-bin-number-edit", order.id],
    queryFn: async () => {
      // 先通过 dispatch_assignments 找到 job_steps
      const { data: assignments } = await supabase
        .from("dispatch_assignments")
        .select("id")
        .eq("order_id", order.id);
      if (!assignments || assignments.length === 0) return "";
      const assignmentIds = assignments.map(a => a.id);
      const { data: steps } = await supabase
        .from("job_steps")
        .select("bin_number_reported")
        .in("assignment_id", assignmentIds)
        .not("bin_number_reported", "is", null)
        .limit(1);
      return steps?.[0]?.bin_number_reported || "";
    },
  });

  // 初始化桶号
  useEffect(() => {
    if (order.bin_number) {
      setForm(f => ({ ...f, bin_number: order.bin_number! }));
    } else if (existingBinNumber && !form.bin_number) {
      setForm(f => ({ ...f, bin_number: existingBinNumber }));
    }
  }, [existingBinNumber, order.bin_number, form.bin_number]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("orders")
        .update({
          type: form.type as any,
          bin_size: (form.bin_size || null) as any,
          bin_type: form.bin_type || null,
          time_window: form.time_window as any,
          time_window_custom: form.time_window_custom || null,
          address: form.address,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          customer_notes: form.customer_notes || null,
          netsuite_order_id: form.netsuite_order_id || null,
          service_date: form.service_date,
          status: form.status as any,
          bin_number: form.bin_number.trim().toUpperCase() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      if (error) throw error;

      // 保存桶号到 job_steps (如果有值)
      if (form.bin_number.trim()) {
        const binNum = form.bin_number.trim().toUpperCase();
        // 自动将新桶加入库存（如果不存在）
        const { error: binError } = await supabase
          .from("bins")
          .upsert(
            { bin_number: binNum, size: (form.bin_size || "20") as any },
            { onConflict: "bin_number", ignoreDuplicates: true }
          );
        if (binError) console.error("Auto-create bin error:", binError);

        const { data: assignments } = await supabase
          .from("dispatch_assignments")
          .select("id")
          .eq("order_id", order.id);
        if (assignments && assignments.length > 0) {
          const assignmentIds = assignments.map(a => a.id);
          // 更新所有关联步骤的 bin_number_reported (通常是 customer_delivery 或 customer_pickup)
          await supabase
            .from("job_steps")
            .update({ bin_number_reported: binNum })
            .in("assignment_id", assignmentIds)
            .in("step_type", ["customer_delivery", "customer_pickup", "depot_pickup"] as any);
        }
      }
    },
    onSuccess: () => { 
      toast.success("已保存"); 
      qc.invalidateQueries({ queryKey: ["orders"] }); 
      qc.invalidateQueries({ queryKey: ["order-bin-numbers"] }); 
      onClose(); 
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>编辑订单 {order.order_number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* 类型 + 状态 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>订单类型</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORDER_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>状态</Label>
              <Select value={form.status || 'pending'} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* 桶类型 + 桶大小 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>桶类型</Label>
              <Select value={form.bin_type} onValueChange={(v) => setForm({ ...form, bin_type: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="选择桶类型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="garbage">垃圾桶</SelectItem>
                  <SelectItem value="brick">砖桶</SelectItem>
                  <SelectItem value="soil">土桶</SelectItem>
                  <SelectItem value="cement">水泥桶</SelectItem>
                  <SelectItem value="asphalt">沥青桶</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>桶大小</Label>
              <Select value={form.bin_size || ''} onValueChange={(v) => setForm({ ...form, bin_size: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="选择大小" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="14">14 yd</SelectItem>
                  <SelectItem value="20">20 yd</SelectItem>
                  <SelectItem value="30">30 yd</SelectItem>
                  <SelectItem value="40">40 yd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* 桶号 */}
          <div>
            <Label>桶号</Label>
            <Input className="mt-1" value={form.bin_number} onChange={(e) => setForm({ ...form, bin_number: e.target.value.toUpperCase() })} placeholder="如: B-20-01" />
          </div>
          {/* 时段 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>时段</Label>
              <Select value={form.time_window} onValueChange={(v) => setForm({ ...form, time_window: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AM">AM</SelectItem>
                  <SelectItem value="PM">PM</SelectItem>
                  <SelectItem value="7-9">7-9</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.time_window === "custom" && (
              <div>
                <Label>自定义时段</Label>
                <Input className="mt-1" value={form.time_window_custom} onChange={(e) => setForm({ ...form, time_window_custom: e.target.value })} placeholder="如: 10:00 - 12:00" />
              </div>
            )}
          </div>
          {/* 日期 */}
          <div>
            <Label>日期</Label>
            <Input type="date" className="mt-1" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} />
          </div>
          {/* 客户信息 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>客户姓名</Label>
              <Input className="mt-1" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            </div>
            <div>
              <Label>客户电话</Label>
              <Input className="mt-1" value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} />
            </div>
          </div>
          {/* 地址 */}
          <div>
            <Label>地址</Label>
            <Input className="mt-1" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          {/* 备注 */}
          <div>
            <Label>备注</Label>
            <Textarea className="mt-1" value={form.customer_notes} onChange={(e) => setForm({ ...form, customer_notes: e.target.value })} placeholder="输入备注信息..." />
          </div>
          {/* Netsuite ID */}
          <div>
            <Label>Netsuite ID</Label>
            <Input className="mt-1" value={form.netsuite_order_id} onChange={(e) => setForm({ ...form, netsuite_order_id: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>保存修改</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
