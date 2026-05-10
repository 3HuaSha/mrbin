import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayISO, typeMeta } from "@/lib/business";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, ChevronDown, ChevronRight, MapPin, Clock, Loader2 } from "lucide-react";
import { DispatchMapWidget } from "@/components/DispatchMapWidget";
import { calculateDriverETAWithSamsara, formatETATime, type DriverETA } from "@/lib/eta-calculator";
import { fetchSamsaraVehicles } from "@/lib/samsara-api";
import { getFullAddress } from "@/lib/manual-step-locations";
import { toast } from "sonner";
import { BusinessTypeSelector } from "@/components/BusinessTypeSelector";
import { useBusinessType } from "@/lib/business-type-storage";

type Driver = { id: string; name: string };

const BIN_TYPE_NAMES: Record<string, string> = {
  garbage: '垃圾桶',
  brick: '砖桶',
  soil: '土桶',
  cement: '水泥桶',
  asphalt: '沥青桶',
};

const STEP_TYPE_LABELS: Record<string, string> = {
  pickup_bin: '取桶',
  drop_bin: '放桶',
  dump_waste: '倒垃圾',
  load_material: '装料',
  unload_material: '卸料',
};

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
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());
  const [calculatingDriverId, setCalculatingDriverId] = useState<string | null>(null);
  const [driverETAs, setDriverETAs] = useState<Record<string, DriverETA>>({});
  const [showingETADrivers, setShowingETADrivers] = useState<Set<string>>(new Set());
  const [businessType, setBusinessType] = useBusinessType();

  const toggleDriver = (id: string) => {
    const next = new Set(expandedDrivers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedDrivers(next);
  };

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers-assigned"],
    queryFn: async () => {
      // 获取已分配车辆的司机 ID
      const { data: assignments } = await supabase
        .from("driver_vehicle_assignments")
        .select("driver_id");
      const assignedIds = (assignments || []).map(a => a.driver_id);

      const { data, error } = await supabase
        .from("profiles")
        .select("id,name")
        .eq("role", "driver")
        .eq("is_active", true)
        .in("id", assignedIds.length > 0 ? assignedIds : ["none"])
        .order("name");
      if (error) throw error;
      return data as Driver[];
    },
  });

  // 获取所有任务步骤（包含订单节点和手动步骤节点）
  const { data: jobSteps = [] } = useQuery({
    queryKey: ["map-job-steps", date, businessType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_steps")
        .select("*, orders(*)")
        .eq("scheduled_date", date)
        .order("step_number");
      if (error) throw error;
      
      // 过滤订单节点，只保留匹配业务类型的
      const filtered = (data ?? []).filter(step => {
        if (step.node_type === 'order' && step.orders) {
          return (step.orders as any).business_type === businessType;
        }
        // 手动步骤节点保留（它们不属于特定业务类型）
        return true;
      });
      
      return filtered as unknown as JobStep[];
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

  const { data: vehicleAssignments = [] } = useQuery({
    queryKey: ["driver-vehicle-assignments-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_vehicle_assignments")
        .select("*, vehicles(*)");
      if (error) throw error;
      return data || [];
    },
  });

  const filteredDrivers = useMemo(() => {
    return drivers.filter(d => {
      const assignment = vehicleAssignments.find((a: any) => a.driver_id === d.id);
      if (!assignment) return false;
      const vName = (assignment.vehicles?.name || "").toUpperCase();
      if (businessType === 'garbage') return vName.startsWith('BIN');
      if (businessType === 'brick') return vName.startsWith('FLAT');
      return true;
    });
  }, [drivers, vehicleAssignments, businessType]);
  
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
    // 如果已经显示ETA，则隐藏
    if (showingETADrivers.has(driverId)) {
      setShowingETADrivers(prev => {
        const next = new Set(prev);
        next.delete(driverId);
        return next;
      });
      // 从driverETAs中移除
      setDriverETAs(prev => {
        const next = { ...prev };
        delete next[driverId];
        return next;
      });
      toast.success(`已隐藏 ${driverName} 的路线`);
      return;
    }
    
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
      
      // 包含所有步骤（订单节点 + 手动步骤节点）
      const allSteps = driverSteps.map(s => {
        if (s.node_type === 'order' && s.orders) {
          return {
            id: s.orders.id,
            address: s.orders.address,
            type: 'order' as const,
            stepNumber: s.step_number
          };
        } else if (s.node_type === 'step' && s.location) {
          // 对于手动步骤，使用完整地址
          return {
            id: s.id,
            address: getFullAddress(s.location), // 转换为完整地址
            type: 'manual' as const,
            stepNumber: s.step_number
          };
        }
        return null;
      }).filter(Boolean).sort((a, b) => a!.stepNumber - b!.stepNumber);
      
      if (allSteps.length === 0) {
        toast.error('该司机没有任务');
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

      // 准备所有步骤数据（包含订单和手动步骤）
      const stepsForETA = allSteps.map(s => ({
        id: s!.id,
        address: s!.address,
      }));

      const eta = await calculateDriverETAWithSamsara(
        driverId,
        driverName,
        assignment.vehicle_id,
        samsaraVehicleId,
        currentLocation,
        stepsForETA
      );

      console.log('✅ ETA 计算结果:', {
        driverId,
        driverName,
        stepsCount: eta.orders.length,
        steps: eta.orders.map(o => ({
          id: o.orderId,
          address: o.orderAddress,
          eta: o.eta,
          status: o.status
        }))
      });

      setDriverETAs(prev => ({ ...prev, [driverId]: eta }));
      setShowingETADrivers(prev => new Set(prev).add(driverId)); // 标记为显示
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
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <h1 className="text-xl font-bold">车队地图</h1>
        <BusinessTypeSelector value={businessType} onChange={setBusinessType} />
      </div>
      
      <div className="flex-1 flex min-h-0">
        {/* 左侧司机任务列表 - 缩小宽度 */}
        <Card className="w-64 flex flex-col overflow-hidden shrink-0 shadow-sm rounded-none border-r border-t-0 border-l-0 border-b-0">
          <div className="p-3 border-b bg-muted/20 font-semibold text-sm flex items-center gap-2 shrink-0">
            <Truck className="h-4 w-4" />
            司机任务 ({filteredDrivers.length})
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
            {filteredDrivers.map(d => {
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
                        variant={showingETADrivers.has(d.id) ? "default" : "ghost"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCalculateDriverETA(d.id, d.name);
                        }}
                        disabled={calculatingDriverId === d.id}
                        className="h-6 w-6 p-0"
                        title={showingETADrivers.has(d.id) ? "隐藏路线" : "计算 ETA"}
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
                            // 订单节点卡片
                            const order = step.orders;
                            const tm = typeMeta(order.type);
                            const binTypeName = order.bin_type ? BIN_TYPE_NAMES[order.bin_type] || order.bin_type : '';
                            const timeLabel = order.time_window_custom || order.time_window || '';
                            const driverETA = driverETAs[d.id];
                            const orderETA = driverETA?.orders.find(o => o.orderId === order.id);
                            
                            return (
                              <div key={step.id} className="relative rounded-lg border-l-4 border-l-blue-500 bg-card shadow-md p-2.5 transition-all duration-300 hover:shadow-xl">
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs font-semibold leading-tight">
                                      {tm.emoji} {tm.label} {order.bin_size ? `${order.bin_size}yd` : ""} {binTypeName}
                                    </div>
                                    {/* 调试：强制显示 ETA 区域 */}
                                    {driverETA && (
                                      <div className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded whitespace-nowrap font-medium border border-blue-200">
                                        {orderETA && orderETA.status === 'OK' ? formatETATime(orderETA.eta) : '无ETA'}
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
                            // 手动步骤节点卡片
                            const stepLabel = STEP_TYPE_LABELS[step.step_type] || step.step_type;
                            
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
            {filteredDrivers.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">当前业务无活跃司机</div>
            )}
          </div>
        </Card>

        {/* 右侧地图 - 移除上方白边 */}
        <div className="flex-1 overflow-hidden relative">
           <DispatchMapWidget 
             drivers={filteredDrivers} 
             orders={orders} 
             assignments={assignments}
             driverETAs={driverETAs}
             businessType={businessType}
           />
        </div>
      </div>
    </div>
  );
}
