import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayISO, typeMeta } from "@/lib/business";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, ChevronDown, ChevronRight, MapPin, AlertTriangle, Clock, Loader2 } from "lucide-react";
import { DispatchMapWidget } from "@/components/DispatchMapWidget";
import { calculateDriverETAWithSamsara, formatETA, formatETATime, type DriverETA } from "@/lib/eta-calculator";
import { fetchSamsaraVehicles } from "@/lib/samsara-api";
import { toast } from "sonner";

type Driver = { id: string; name: string };

type Order = { 
  id: string; 
  order_number: string; 
  address: string; 
  type: string; 
  status: string; 
  customer_notes?: string;
  bin_size?: string;
  bin_type?: string;
  time_window?: string;
  time_window_custom?: string;
};

type Assignment = {
  id: string;
  driver_id: string;
  order_id: string;
  sequence: number;
  orders: Order;
};

type JobStep = {
  id: string;
  driver_id: string;
  scheduled_date: string;
  step_number: number;
  order_id: string | null;
  assignment_id: string | null;
  node_type: 'order' | 'step';
  location: string | null;
  step_type: string;
  bin_id: string | null;
  notes: string | null;
  status: string;
  orders?: Order | null;
};

export function FleetMapPage() {
  const [date, setDate] = useState(todayISO());
  const [now, setNow] = useState(Date.now());
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());
  const [calculatingDriverId, setCalculatingDriverId] = useState<string | null>(null);
  const [driverETAs, setDriverETAs] = useState<Record<string, DriverETA>>({});

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

  // 获取所有任务步骤（包含订单节点和手动步骤节点）
  const { data: jobSteps = [] } = useQuery({
    queryKey: ["map-job-steps", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_steps")
        .select("*, orders(*)")
        .eq("scheduled_date", date)
        .order("step_number");
      if (error) throw error;
      return (data ?? []) as unknown as JobStep[];
    },
  });
  
  // 提取所有订单（只包含订单节点，用于地图显示）
  const orders = useMemo(() => {
    const uniqueOrders = new Map<string, Order>();
    jobSteps.forEach(step => {
      if (step.node_type === 'order' && step.orders) {
        uniqueOrders.set(step.orders.id, step.orders);
      }
    });
    return Array.from(uniqueOrders.values());
  }, [jobSteps]);

  // 按司机分组任务步骤
  const driverJobSteps = useMemo(() => {
    const map: Record<string, JobStep[]> = {};
    for (const step of jobSteps) {
      (map[step.driver_id] ??= []).push(step);
    }
    return map;
  }, [jobSteps]);
  
  // 为了兼容地图组件，仍然需要 assignments
  const assignments = useMemo(() => {
    return jobSteps
      .filter(step => step.node_type === 'order' && step.assignment_id)
      .map(step => ({
        id: step.assignment_id!,
        driver_id: step.driver_id,
        order_id: step.order_id!,
        sequence: step.step_number,
        orders: step.orders!
      }));
  }, [jobSteps]);

  // 计算单个司机的 ETA
  const handleCalculateDriverETA = async (driverId: string, driverName: string) => {
    setCalculatingDriverId(driverId);
    try {
      // 获取 Samsara 车辆位置
      const samsaraResult = await fetchSamsaraVehicles();
      if (!samsaraResult.success) {
        toast.error('无法获取车辆位置');
        return;
      }

      // 获取车辆分配信息
      const { data: vehicleAssignments } = await supabase
        .from("driver_vehicle_assignments")
        .select(`
          driver_id,
          vehicle_id,
          profiles!driver_vehicle_assignments_driver_id_fkey(name),
          vehicles!driver_vehicle_assignments_vehicle_id_fkey(name, samsara_id)
        `);

      const driverSteps = driverJobSteps[driverId] ?? [];
      const orderSteps = driverSteps.filter(s => s.node_type === 'order' && s.orders);
      
      if (orderSteps.length === 0) {
        toast.error('该司机没有订单任务');
        return;
      }

      // 找到司机的车辆
      const assignment = vehicleAssignments?.find((a: any) => a.driver_id === driverId);
      if (!assignment) {
        toast.error('未找到司机的车辆分配');
        return;
      }

      const samsaraVehicleId = assignment.vehicles?.samsara_id;
      if (!samsaraVehicleId) {
        toast.error('车辆没有 Samsara ID');
        return;
      }

      // 找到车辆的实时位置
      const vehicle = samsaraResult.data.find(v => v.id === samsaraVehicleId);
      if (!vehicle || !vehicle.location) {
        toast.error('无法获取车辆位置');
        return;
      }

      const currentLocation = {
        lat: vehicle.location.latitude,
        lng: vehicle.location.longitude,
      };

      // 准备订单数据
      const ordersForETA = orderSteps.map(s => ({
        id: s.orders!.id,
        address: s.orders!.address,
      }));

      const eta = await calculateDriverETAWithSamsara(
        driverId,
        driverName,
        assignment.vehicle_id,
        samsaraVehicleId,
        currentLocation,
        ordersForETA
      );

      console.log('✅ ETA 计算结果:', {
        driverId,
        driverName,
        ordersCount: eta.orders.length,
        orders: eta.orders.map(o => ({
          orderId: o.orderId,
          address: o.orderAddress,
          eta: o.eta,
          status: o.status
        }))
      });

      setDriverETAs(prev => ({ ...prev, [driverId]: eta }));
      toast.success(`${driverName} 的 ETA 计算完成`);
    } catch (error) {
      console.error('计算 ETA 失败:', error);
      toast.error('计算 ETA 失败');
    } finally {
      setCalculatingDriverId(null);
    }
  };

  return (
    <div className="p-0 h-screen flex flex-col">
      <div className="flex-1 flex min-h-0">
        {/* 左侧司机任务列表 - 缩小宽度 */}
        <Card className="w-64 flex flex-col overflow-hidden shrink-0 shadow-sm rounded-none border-r border-t-0 border-l-0 border-b-0">
          <div className="p-3 border-b bg-muted/20 font-semibold text-sm flex items-center gap-2 shrink-0">
            <Truck className="h-4 w-4" />
            司机任务 ({drivers.length})
          </div>
          
          {/* 日期选择器 */}
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
              const steps = driverJobSteps[d.id] ?? [];
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
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-xs">{steps.length}</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCalculateDriverETA(d.id, d.name);
                        }}
                        disabled={calculatingDriverId === d.id}
                        className="h-6 w-6 p-0"
                        title="计算 ETA"
                      >
                        {calculatingDriverId === d.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="p-2 space-y-1.5 border-t bg-muted/10">
                      {steps.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-3">暂无任务</div>
                      ) : (
                        steps.map((step, i) => {
                          if (step.node_type === 'order' && step.orders) {
                            // 订单节点卡片 - 完全匹配排班页面样式
                            const order = step.orders;
                            const tm = typeMeta(order.type);
                            
                            // 桶类型中文映射
                            const binTypeNames: Record<string, string> = {
                              'garbage': '垃圾桶',
                              'brick': '砖桶',
                              'soil': '土桶',
                              'cement': '水泥桶',
                              'asphalt': '沥青桶'
                            };
                            const binTypeName = order.bin_type ? binTypeNames[order.bin_type] || order.bin_type : '';
                            
                            // 时段标签
                            const timeLabel = order.time_window_custom || order.time_window || '';
                            
                            // 获取该订单的 ETA
                            const driverETA = driverETAs[d.id];
                            const orderETA = driverETA?.orders.find(o => o.orderId === order.id);
                            
                            // 调试日志
                            if (driverETA) {
                              console.log('🔍 司机 ETA 数据:', {
                                driverId: d.id,
                                driverName: d.name,
                                orderId: order.id,
                                orderAddress: order.address,
                                hasDriverETA: !!driverETA,
                                orderETACount: driverETA.orders.length,
                                foundOrderETA: !!orderETA,
                                orderETA: orderETA
                              });
                            }
                            
                            return (
                              <div key={step.id} className="relative rounded-lg border-l-4 border-l-blue-500 bg-card shadow-md p-2.5 transition-all duration-300 hover:shadow-xl">
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-semibold leading-tight">
                                      {tm.emoji} {tm.label} {order.bin_size ? `${order.bin_size}yd` : ""} {binTypeName}
                                    </div>
                                    {orderETA && orderETA.status === 'OK' && (
                                      <div className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded whitespace-nowrap font-medium">
                                        {formatETATime(orderETA.eta)}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground leading-snug break-words" title={order.address}>
                                    {order.address}
                                  </div>
                                  <div className="text-[10px] text-primary font-medium">{timeLabel}</div>
                                  
                                  {order.customer_notes && (
                                    <div className="text-[9px] text-status-progress truncate">
                                      📝 {order.customer_notes}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          } else {
                            // 手动步骤节点卡片 - 完全匹配排班页面样式
                            const stepTypeLabels: Record<string, string> = {
                              'pickup_bin': '取桶',
                              'drop_bin': '放桶',
                              'dump_waste': '倒垃圾',
                              'load_material': '装料',
                              'unload_material': '卸料',
                            };
                            const stepLabel = stepTypeLabels[step.step_type] || step.step_type;
                            
                            return (
                              <div key={step.id} className="relative rounded-lg border-l-4 border-l-gray-400 bg-card/80 shadow-sm p-2 transition-all duration-300 hover:shadow-lg">
                                <div className="flex flex-col gap-1">
                                  <div className="text-[11px] font-semibold">
                                    {stepLabel}
                                  </div>
                                  {step.location && (
                                    <div className="text-[9px] text-muted-foreground leading-snug break-words" title={step.location}>
                                      <MapPin className="h-2 w-2 inline mr-0.5" />
                                      {step.location}
                                    </div>
                                  )}
                                  {step.bin_id && (
                                    <div className="text-[9px] text-primary">桶: {step.bin_id}</div>
                                  )}
                                  {step.notes && (
                                    <div className="text-[8px] text-muted-foreground truncate">
                                      📝 {step.notes}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                        })
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
