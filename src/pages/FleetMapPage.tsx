import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayISO } from "@/lib/business";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Truck, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { DispatchMapWidget } from "@/components/DispatchMapWidget";

type Driver = { id: string; name: string };

type Order = { id: string; order_number: string; address: string; type: string; status: string; customer_notes?: string };

type Assignment = {
  id: string;
  driver_id: string;
  order_id: string;
  sequence: number;
  orders: Order;
};

export function FleetMapPage() {
  const [date, setDate] = useState(todayISO());
  const [now, setNow] = useState(Date.now());
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());

  // 自动刷新
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const toggleDriver = (id: string) => {
    const next = new Set(expandedDrivers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedDrivers(next);
  };

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,name")
        .eq("role", "driver")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Driver[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["map-assignments", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatch_assignments")
        .select("id,driver_id,order_id,sequence,orders(*)")
        .eq("scheduled_date", date)
        .order("sequence");
      if (error) throw error;
      return (data ?? []) as unknown as Assignment[];
    },
  });
  
  const orders = useMemo(() => {
    const uniqueOrders = new Map<string, Order>();
    assignments.forEach(a => {
      if (a.orders) uniqueOrders.set(a.orders.id, a.orders);
    });
    return Array.from(uniqueOrders.values());
  }, [assignments]);

  const driverAssignments = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    for (const a of assignments) {
      (map[a.driver_id] ??= []).push(a);
    }
    return map;
  }, [assignments]);

  return (
    <div className="p-0 h-screen flex flex-col">
      <div className="flex-1 flex min-h-0">
        {/* 左侧司机任务列表 - 缩小宽度 */}
        <Card className="w-64 flex flex-col overflow-hidden shrink-0 shadow-sm rounded-none border-r border-t-0 border-l-0 border-b-0">
          <div className="p-3 border-b bg-muted/20 font-semibold text-sm flex items-center gap-2 shrink-0">
            <Truck className="h-4 w-4" />
            司机任务 ({drivers.length})
          </div>
          
          {/* 日期选择器 - 移到左侧栏 */}
          <div className="p-3 border-b bg-background shrink-0">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-9 px-3 rounded-md border bg-background text-sm"
            />
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {drivers.map(d => {
              const ass = driverAssignments[d.id] ?? [];
              const isExpanded = expandedDrivers.has(d.id);
              
              return (
                <div key={d.id} className="border rounded-md overflow-hidden bg-card">
                  <div 
                    className="flex items-center justify-between p-2 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => toggleDriver(d.id)}
                  >
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground"/> : <ChevronRight className="h-4 w-4 text-muted-foreground"/>}
                      {d.name}
                    </div>
                    <Badge variant="secondary" className="text-xs">{ass.length}</Badge>
                  </div>
                  
                  {isExpanded && (
                    <div className="p-2 space-y-1.5 border-t bg-muted/10">
                      {ass.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-3">暂无任务</div>
                      ) : (
                        ass.map((a, i) => (
                          <div key={a.id} className="text-xs p-2 rounded bg-background border shadow-sm flex flex-col gap-1 hover:border-primary/30 transition-colors">
                            <div className="flex items-center gap-1.5">
                              <span className="bg-primary/10 text-primary w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0">{i+1}</span>
                              <span className="uppercase text-[10px] bg-muted px-1.5 py-0.5 rounded">{a.orders.type}</span>
                            </div>
                            {/* 尺寸和时段放在同一行 */}
                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="text-muted-foreground">{a.orders.bin_size || "—"}</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">{a.orders.time_window || "—"}</span>
                            </div>
                            {/* 地址截断显示 */}
                            <div className="text-muted-foreground truncate text-[10px]" title={a.orders.address}>
                              <MapPin className="h-3 w-3 inline mr-1 text-primary/50"/>
                              {a.orders.address}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {drivers.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">无活跃司机</div>
            )}
          </div>
        </Card>

        {/* 右侧地图 - 移除上方白边 */}
        <div className="flex-1 overflow-hidden relative">
           <DispatchMapWidget drivers={drivers} orders={orders} assignments={assignments} />
        </div>
      </div>
    </div>
  );
}
