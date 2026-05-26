import { Database } from "@/integrations/supabase/types";
import { BusinessType } from "@/lib/business";

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];

export type Order = Tables<"orders"> & {
  business_type?: BusinessType;
  brick_order_type?: string | null;
  origin_factory_id?: string | null;
  origin_yard_id?: string | null;
  destination_yard_id?: string | null;
  pallet_count?: number | null;
  can_split?: boolean | null;
  priority?: string | null;
  linked_order_id?: string | null;
  bin_type?: string | null;
};

export type Profile = Tables<"profiles">;

export type Vehicle = Tables<"vehicles"> & {
  max_pallets?: number | null;
};

export type Bin = Tables<"bins">;

export type Assignment = Tables<"dispatch_assignments"> & {
  orders: Order;
  vehicles: Vehicle;
  bins: Bin | null;
};

export type JobStep = Tables<"job_steps"> & {
  orders?: Order | null;
};

export type CommonLocation = Tables<"common_locations">;

export type DriverVehicleAssignment = {
  driver_id: string;
  vehicle_id: string;
  vehicles?: Vehicle | null;
};
