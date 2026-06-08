import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type ParsedBinOrder = {
  source_row: number;
  order_number: string;
  type: "delivery" | "pickup" | "swap" | "material";
  service_date: string;
  time_window: "AM" | "PM" | "custom";
  time_window_custom: string | null;
  bin_size: "14" | "20" | "40" | null;
  bin_type: string | null;
  material_description: string | null;
  bin_number: string | null;
  customer_name: string;
  customer_phone: string;
  address: string;
  customer_notes: string | null;
  confidence: number;
  issues: string[];
};

type ImportResult = {
  order: ParsedBinOrder;
  action: string;
  ok: boolean;
};

const TYPE_LABEL: Record<ParsedBinOrder["type"], string> = {
  delivery: "送桶",
  pickup: "收桶",
  swap: "换桶",
  material: "材料",
};

export function BulkBinOrderImportDialog() {
  const [open, setOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ParsedBinOrder[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const qc = useQueryClient();

  const readyCount = useMemo(() => parsed.filter((o) => o.address && o.order_number && o.issues.length === 0).length, [parsed]);
  const summary = useMemo(() => {
    const list = results.length > 0 ? results.map((r) => r.order) : parsed;
    return {
      delivery: list.filter((o) => o.type === "delivery").length,
      pickup: list.filter((o) => o.type === "pickup").length,
      swap: list.filter((o) => o.type === "swap").length,
      skipped: results.filter((r) => !r.ok || r.action.includes("跳过")).length,
      done: results.filter((r) => r.ok && !r.action.includes("跳过")).length,
    };
  }, [parsed, results]);

  const parseOrders = useMutation({
    mutationFn: async () => {
      const text = rawText.trim();
      if (!text) throw new Error("请先粘贴或上传 Sheet 内容");
      return parseCsvWithAi(text);
    },
    onSuccess: (orders) => {
      setParsed(orders);
      setResults([]);
      toast.success(`已识别 ${orders.length} 行`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const importOrders = useMutation({
    mutationFn: async () => {
      const out: ImportResult[] = [];
      for (const order of parsed) {
        if (!order.order_number || !order.address) {
          out.push({ order, ok: false, action: "缺少单号或地址，已跳过" });
          continue;
        }

        if (order.type === "pickup") {
          out.push(await completePickup(order));
        } else {
          out.push(await upsertOpenOrder(order));
        }
      }
      return out;
    },
    onSuccess: (out) => {
      setResults(out);
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`导入完成：${out.filter((r) => r.ok).length}/${out.length}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const parseAndImport = useMutation({
    mutationFn: async () => {
      const text = rawText.trim();
      if (!text) throw new Error("请先粘贴或上传 Sheet 内容");

      const orders = await parseCsvWithAi(text);
      const out: ImportResult[] = [];
      for (const order of orders) {
        if (!order.order_number || !order.address) {
          out.push({ order, ok: false, action: "缺少单号或地址，已跳过" });
          continue;
        }
        out.push(order.type === "pickup" ? await completePickup(order) : await upsertOpenOrder(order));
      }
      return { orders, out };
    },
    onSuccess: ({ orders, out }) => {
      setParsed(orders);
      setResults(out);
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`导入完成：写入/更新 ${out.filter((r) => r.ok && !r.action.includes("跳过")).length}，跳过 ${out.filter((r) => !r.ok || r.action.includes("跳过")).length}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function completePickup(order: ParsedBinOrder): Promise<ImportResult> {
    const existingPickup = await supabase
      .from("orders")
      .select("id")
      .eq("order_number", order.order_number)
      .eq("type", "pickup")
      .limit(1);
    if (existingPickup.error) throw existingPickup.error;
    if (existingPickup.data?.[0]) {
      return { order, ok: true, action: "收桶单已存在，已跳过" };
    }

    const match = await findPickupTarget(order);
    let pickupId: string | null = null;
    const insertedPickup = await supabase
      .from("orders")
      .insert(toInsertPayload(order, "done"))
      .select("id")
      .single();
    if (insertedPickup.error) throw insertedPickup.error;
    pickupId = insertedPickup.data.id;

    if (match) {
      const { error } = await supabase
        .from("orders")
        .update({ status: "done", linked_order_id: pickupId, updated_at: new Date().toISOString() })
        .eq("id", match.id);
      if (error) throw error;
      await supabase.from("orders").update({ linked_order_id: match.id }).eq("id", pickupId);
      return { order, ok: true, action: `已按收桶完成 ${match.order_number}` };
    }

    return { order, ok: true, action: "未找到原送桶单，已保留已完成收桶记录" };
  }

  async function findPickupTarget(order: ParsedBinOrder): Promise<{ id: string; order_number: string } | null> {
    const byNumber = await supabase
      .from("orders")
      .select("id, order_number")
      .eq("order_number", order.order_number)
      .in("type", ["delivery", "swap"])
      .neq("status", "cancelled")
      .order("service_date", { ascending: false })
      .limit(1);
    if (byNumber.error) throw byNumber.error;
    if (byNumber.data?.[0]) return byNumber.data[0];

    const byAddress = await supabase
      .from("orders")
      .select("id, order_number")
      .ilike("address", `%${order.address.slice(0, 42)}%`)
      .in("type", ["delivery", "swap"])
      .is("linked_order_id", null)
      .neq("status", "cancelled")
      .order("service_date", { ascending: false })
      .limit(1);
    if (byAddress.error) throw byAddress.error;
    return byAddress.data?.[0] ?? null;
  }

  async function upsertOpenOrder(order: ParsedBinOrder): Promise<ImportResult> {
    const existing = await supabase
      .from("orders")
      .select("id")
      .eq("order_number", order.order_number)
      .eq("type", order.type)
      .limit(1);
    if (existing.error) throw existing.error;
    if (existing.data?.[0]) {
      return { order, ok: true, action: `${TYPE_LABEL[order.type]}单已存在，已跳过` };
    }

    const { error } = await supabase.from("orders").insert(toInsertPayload(order, "done"));
    if (error) throw error;
    return { order, ok: true, action: order.type === "swap" ? "换桶按已送达导入" : "已送达导入，等待后续回收" };
  }

  function toInsertPayload(order: ParsedBinOrder, status: "done" | "pending") {
    return {
      order_number: order.order_number,
      type: order.type,
      bin_size: order.type === "material" ? null : order.bin_size,
      bin_type: order.type === "material" ? (order.material_description || order.bin_type || "material") : (order.bin_type || "garbage"),
      bin_number: order.bin_number,
      business_type: order.type === "material" ? "material" : "garbage",
      service_date: order.service_date,
      time_window: order.time_window,
      time_window_custom: order.time_window_custom,
      address: order.address,
      customer_name: order.customer_name || "Sheet Import",
      customer_phone: order.customer_phone || "",
      customer_notes: order.customer_notes,
      status,
      priority: "P3",
      can_split: true,
    };
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    setRawText(await file.text());
    setParsed([]);
    setResults([]);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="mr-2 h-4 w-4" />
        批量导入
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>批量导入桶订单</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <div className="space-y-3">
              <input
                type="file"
                accept=".csv,.txt"
                className="block w-full text-sm"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              <Textarea
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  setParsed([]);
                  setResults([]);
                }}
                placeholder="粘贴 Google Sheet 导出的 CSV 内容"
                className="h-[360px] font-mono text-xs"
              />
              <Button className="w-full" onClick={() => parseAndImport.mutate()} disabled={parseAndImport.isPending}>
                <Wand2 className="mr-2 h-4 w-4" />
                {parseAndImport.isPending ? "AI 导入中..." : "AI 识别并导入"}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => parseOrders.mutate()} disabled={parseOrders.isPending || parseAndImport.isPending}>
                只识别预览
              </Button>
            </div>

            <div className="min-h-[360px] overflow-hidden rounded-md border">
              <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-sm">
                <span>导入汇总 {parsed.length > 0 ? `· 识别 ${parsed.length} 行` : ""}</span>
                {results.length > 0 && <Badge variant="secondary">完成 {summary.done} · 跳过 {summary.skipped}</Badge>}
              </div>
              <div className="space-y-3 p-4">
                <div className="grid grid-cols-3 gap-2">
                  <SummaryCard label="送桶" value={summary.delivery} />
                  <SummaryCard label="收桶" value={summary.pickup} />
                  <SummaryCard label="换桶" value={summary.swap} />
                </div>
                <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                  规则：只导入桶订单；纯砂石料会跳过；同一行有桶和砂石料时只导入桶。送桶和换桶会按已送达导入，保留为未回收记录；收桶会创建已完成收桶记录，并把对应送桶/换桶标记完成；重复单号会跳过。
                </div>
              </div>
              <div className="max-h-[300px] overflow-auto border-t">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background text-left text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">单号</th>
                      <th className="px-2 py-2">类型</th>
                      <th className="px-2 py-2">日期/时间</th>
                      <th className="px-2 py-2">桶/材料</th>
                      <th className="px-2 py-2">地址</th>
                      <th className="px-2 py-2">结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                          上传或粘贴后，点击 AI 识别
                        </td>
                      </tr>
                    )}
                    {parsed.map((order, idx) => {
                      const result = results.find((r) => r.order === order);
                      return (
                        <tr key={`${order.order_number}-${order.type}-${idx}`} className="border-t align-top">
                          <td className="px-2 py-2 font-mono font-semibold">{order.order_number}</td>
                          <td className="px-2 py-2">{TYPE_LABEL[order.type]}</td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            {order.service_date}
                            <div className="text-muted-foreground">{order.time_window_custom || order.time_window}</div>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            {order.bin_number && <div>{order.bin_number}</div>}
                            <div>{order.material_description || (order.bin_size ? `${order.bin_size}YD` : "未识别")}</div>
                          </td>
                          <td className="max-w-[320px] px-2 py-2">
                            <div className="line-clamp-2">{order.address}</div>
                            {order.customer_phone && <div className="text-muted-foreground">{order.customer_phone}</div>}
                            {order.issues.length > 0 && (
                              <div className="mt-1 text-amber-700">{order.issues.join(", ")}</div>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {result ? (
                              <span className={result.ok ? "text-green-700" : "text-red-700"}>{result.action}</span>
                            ) : (
                              <span className="text-muted-foreground">{Math.round(order.confidence * 100)}%</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>关闭</Button>
            <Button variant="secondary" onClick={() => importOrders.mutate()} disabled={parsed.length === 0 || importOrders.isPending || parseAndImport.isPending}>
              {importOrders.isPending ? "写入中..." : "导入预览结果"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

async function parseCsvWithAi(text: string): Promise<ParsedBinOrder[]> {
  const response = await fetch("/api/import-bin-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `导入解析失败 (${response.status})`);
  }
  return (data?.orders ?? []) as ParsedBinOrder[];
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
