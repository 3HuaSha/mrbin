import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayISO } from "@/lib/business";
import { 
  Order, 
  Assignment, 
  JobStep, 
  Profile, 
  Vehicle, 
  Bin, 
  CommonLocation,
  DriverVehicleAssignment
} from "@/types/dispatch";
import { BusinessType } from "@/lib/business";

export function useDispatchData(date: string, businessType: BusinessType) {
  const qc = useQueryClient();

  // Supabase Realtime
  useEffect(() => {
    const channel = supabase.channel('dispatch-realtime-' + date)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_steps' }, () => {
        qc.invalidateQueries({ queryKey: ["job-steps", date] });
        qc.invalidateQueries({ queryKey: ["dispatch-assignments", date] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        qc.invalidateQueries({ queryKey: ["dispatch-orders", date] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [date, qc]);

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers-assigned"],
    queryFn: async () => {
      const { data: assignments } = await supabase
        .from("driver_vehicle_assignments")
        .select("driver_id");
      const assignedIds = (assignments || []).map((a: { driver_id: string }) => a.driver_id);

      const { data, error } = await supabase.from("profiles")
        .select("*")
        .eq("role", "driver")
        .eq("is_active", true)
        .in("id", assignedIds.length > 0 ? assignedIds : ["none"])
        .order("name");
      if (error) throw error;
      return data as Profile[];
    },
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles")
        .select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data as Vehicle[];
    },
  });

  const { data: vehicleAssignments = [] } = useQuery({
    queryKey: ["driver-vehicle-assignments-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_vehicle_assignments")
        .select("*, vehicles(*)");
      if (error) throw error;
      return data as unknown as DriverVehicleAssignment[];
    },
  });

  const { data: bins = [] } = useQuery({
    queryKey: ["bins-depot"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bins")
        .select("*").eq("status", "depot").eq("is_active", true).order("bin_number");
      if (error) throw error;
      return data as Bin[];
    },
  });

  const { data: ordersData } = useQuery({
    queryKey: ["dispatch-orders", date, businessType],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*")
        .eq("service_date", date)
        .in("business_type", businessType === 'garbage' ? ['garbage', 'material'] : [businessType])
        .neq("status", "cancelled").order("created_at");
      if (error) throw error;
      
      const mainIds = new Set((data ?? []).filter((o: any) => o.type === "swap").map((o: any) => o.id));
      const swapToPickup: Record<string, string> = {};
      (data ?? []).forEach((o: any) => {
        if (o.type === "pickup" && o.linked_order_id && mainIds.has(o.linked_order_id)) {
          swapToPickup[o.linked_order_id] = o.id;
        }
      });
      const filtered = (data ?? []).filter((o: any) => {
        if (o.type === "pickup" && o.linked_order_id && mainIds.has(o.linked_order_id)) return false;
        return true;
      }) as Order[];
      return { orders: filtered, swapToPickup };
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["dispatch-assignments", date, businessType],
    queryFn: async () => {
      const { data, error } = await supabase.from("dispatch_assignments")
        .select("*, orders(*), vehicles(*), bins(*)")
        .eq("scheduled_date", date).order("sequence");
      if (error) throw error;
      
      const filtered = (data ?? []).filter((a: any) => {
        const bt = (a.orders as any)?.business_type;
        return businessType === 'garbage' ? (bt === 'garbage' || bt === 'material') : bt === businessType;
      });
      
      return filtered as unknown as Assignment[];
    },
  });

  const { data: jobSteps = [] } = useQuery({
    queryKey: ["job-steps", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_steps")
        .select("*")
        .eq("scheduled_date", date)
        .order("driver_id")
        .order("step_number");
      if (error) throw error;
      return (data ?? []) as JobStep[];
    },
  });

  const { data: commonLocations = [] } = useQuery({
    queryKey: ["common-locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("common_locations")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CommonLocation[];
    },
  });

  const filteredDrivers = useMemo(() => {
    return drivers.filter((d: Profile) => {
      const assignment = vehicleAssignments.find((a: any) => a.driver_id === d.id);
      if (!assignment) return false;
      const vName = (assignment.vehicles?.name || "").toUpperCase();
      if (businessType === 'garbage') return vName.startsWith('BIN');
      if (businessType === 'brick') return vName.startsWith('FLAT');
      return true;
    });
  }, [drivers, vehicleAssignments, businessType]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v: Vehicle) => {
      const vName = (v.name || "").toUpperCase();
      if (businessType === 'garbage') return vName.startsWith('BIN');
      if (businessType === 'brick') return vName.startsWith('FLAT');
      return true;
    });
  }, [vehicles, businessType]);

  return {
    drivers: filteredDrivers,
    allDrivers: drivers,
    vehicles: filteredVehicles,
    allVehicles: vehicles,
    vehicleAssignments,
    bins,
    orders: ordersData?.orders ?? [],
    swapToPickup: ordersData?.swapToPickup ?? {},
    assignments,
    jobSteps,
    commonLocations,
  };
}
