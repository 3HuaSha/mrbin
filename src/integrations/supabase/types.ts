export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          details: Json | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          recorded_at: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          recorded_at?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          recorded_at?: string | null
        }
        Relationships: []
      }
      bin_history: {
        Row: {
          bin_id: string
          event: Database["public"]["Enums"]["bin_event"]
          from_location: string | null
          id: string
          order_id: string | null
          recorded_at: string | null
          to_location: string | null
        }
        Insert: {
          bin_id: string
          event: Database["public"]["Enums"]["bin_event"]
          from_location?: string | null
          id?: string
          order_id?: string | null
          recorded_at?: string | null
          to_location?: string | null
        }
        Update: {
          bin_id?: string
          event?: Database["public"]["Enums"]["bin_event"]
          from_location?: string | null
          id?: string
          order_id?: string | null
          recorded_at?: string | null
          to_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bin_history_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bin_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      bins: {
        Row: {
          bin_number: string
          created_at: string | null
          current_address: string | null
          current_order_id: string | null
          id: string
          is_active: boolean | null
          last_moved_at: string | null
          notes: string | null
          size: Database["public"]["Enums"]["bin_size"]
          status: Database["public"]["Enums"]["bin_status"] | null
        }
        Insert: {
          bin_number: string
          created_at?: string | null
          current_address?: string | null
          current_order_id?: string | null
          id?: string
          is_active?: boolean | null
          last_moved_at?: string | null
          notes?: string | null
          size: Database["public"]["Enums"]["bin_size"]
          status?: Database["public"]["Enums"]["bin_status"] | null
        }
        Update: {
          bin_number?: string
          created_at?: string | null
          current_address?: string | null
          current_order_id?: string | null
          id?: string
          is_active?: boolean | null
          last_moved_at?: string | null
          notes?: string | null
          size?: Database["public"]["Enums"]["bin_size"]
          status?: Database["public"]["Enums"]["bin_status"] | null
        }
        Relationships: []
      }
      dispatch_assignments: {
        Row: {
          bin_id: string | null
          created_at: string | null
          dispatch_notes: string | null
          driver_id: string
          id: string
          order_id: string
          scheduled_date: string
          sequence: number
          vehicle_id: string
        }
        Insert: {
          bin_id?: string | null
          created_at?: string | null
          dispatch_notes?: string | null
          driver_id: string
          id?: string
          order_id: string
          scheduled_date: string
          sequence?: number
          vehicle_id: string
        }
        Update: {
          bin_id?: string | null
          created_at?: string | null
          dispatch_notes?: string | null
          driver_id?: string
          id?: string
          order_id?: string
          scheduled_date?: string
          sequence?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_assignments_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "bins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          driver_id: string
          heading: number | null
          id: string
          lat: number
          lng: number
          recorded_at: string | null
          speed_kmh: number | null
          vehicle_id: string | null
        }
        Insert: {
          driver_id: string
          heading?: number | null
          id?: string
          lat: number
          lng: number
          recorded_at?: string | null
          speed_kmh?: number | null
          vehicle_id?: string | null
        }
        Update: {
          driver_id?: string
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string | null
          speed_kmh?: number | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_steps: {
        Row: {
          assignment_id: string | null
          bin_id: string | null
          bin_number_reported: string | null
          completed_at: string | null
          created_at: string | null
          driver_id: string
          dump_site: string | null
          id: string
          location: string
          node_type: 'order' | 'step'
          notes: string | null
          old_bin_number_reported: string | null
          order_id: string | null
          photo_url: string | null
          pickup_photo_url: string | null
          requires_bin_number: boolean | null
          requires_photo: boolean | null
          requires_weigh_ticket: boolean | null
          requires_weight: boolean | null
          scheduled_date: string
          status: Database["public"]["Enums"]["step_status"] | null
          step_number: number
          step_type: Database["public"]["Enums"]["step_type"]
          weigh_ticket_url: string | null
          weight_kg: number | null
        }
        Insert: {
          assignment_id?: string | null
          bin_id?: string | null
          bin_number_reported?: string | null
          completed_at?: string | null
          created_at?: string | null
          driver_id: string
          dump_site?: string | null
          id?: string
          location: string
          node_type?: 'order' | 'step'
          notes?: string | null
          old_bin_number_reported?: string | null
          order_id?: string | null
          photo_url?: string | null
          pickup_photo_url?: string | null
          requires_bin_number?: boolean | null
          requires_photo?: boolean | null
          requires_weigh_ticket?: boolean | null
          requires_weight?: boolean | null
          scheduled_date: string
          status?: Database["public"]["Enums"]["step_status"] | null
          step_number: number
          step_type: Database["public"]["Enums"]["step_type"]
          weigh_ticket_url?: string | null
          weight_kg?: number | null
        }
        Update: {
          assignment_id?: string | null
          bin_id?: string | null
          bin_number_reported?: string | null
          completed_at?: string | null
          created_at?: string | null
          driver_id?: string
          dump_site?: string | null
          id?: string
          location?: string
          node_type?: 'order' | 'step'
          notes?: string | null
          old_bin_number_reported?: string | null
          order_id?: string | null
          photo_url?: string | null
          pickup_photo_url?: string | null
          requires_bin_number?: boolean | null
          requires_photo?: boolean | null
          requires_weigh_ticket?: boolean | null
          requires_weight?: boolean | null
          scheduled_date?: string
          status?: Database["public"]["Enums"]["step_status"] | null
          step_number?: number
          step_type?: Database["public"]["Enums"]["step_type"]
          weigh_ticket_url?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_steps_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "dispatch_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_steps_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_steps_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      common_locations: {
        Row: {
          id: string
          name: string
          address: string
          type: string | null
          is_active: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          address: string
          type?: string | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          address?: string
          type?: string | null
          is_active?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          address: string
          bin_size: Database["public"]["Enums"]["bin_size"] | null
          bin_number: string | null
          bin_type: string | null
          brick_order_type: Database["public"]["Enums"]["brick_order_type"] | null
          business_type: Database["public"]["Enums"]["business_type"]
          can_split: boolean
          created_at: string | null
          created_by: string | null
          customer_name: string
          customer_notes: string | null
          customer_phone: string
          destination_yard_id: string | null
          id: string
          netsuite_order_id: string | null
          order_number: string
          origin_factory_id: string | null
          origin_yard_id: string | null
          pallet_count: number | null
          priority: string
          service_date: string
          status: Database["public"]["Enums"]["order_status"] | null
          time_window: Database["public"]["Enums"]["time_window"]
          time_window_custom: string | null
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string | null
        }
        Insert: {
          address: string
          bin_size?: Database["public"]["Enums"]["bin_size"] | null
          bin_number?: string | null
          bin_type?: string | null
          brick_order_type?: Database["public"]["Enums"]["brick_order_type"] | null
          business_type?: Database["public"]["Enums"]["business_type"]
          can_split?: boolean
          created_at?: string | null
          created_by?: string | null
          customer_name: string
          customer_notes?: string | null
          customer_phone: string
          destination_yard_id?: string | null
          id?: string
          netsuite_order_id?: string | null
          order_number: string
          origin_factory_id?: string | null
          origin_yard_id?: string | null
          pallet_count?: number | null
          priority?: string
          service_date: string
          status?: Database["public"]["Enums"]["order_status"] | null
          time_window: Database["public"]["Enums"]["time_window"]
          time_window_custom?: string | null
          type: Database["public"]["Enums"]["order_type"]
          updated_at?: string | null
        }
        Update: {
          address?: string
          bin_size?: Database["public"]["Enums"]["bin_size"] | null
          bin_number?: string | null
          bin_type?: string | null
          brick_order_type?: Database["public"]["Enums"]["brick_order_type"] | null
          business_type?: Database["public"]["Enums"]["business_type"]
          can_split?: boolean
          created_at?: string | null
          created_by?: string | null
          customer_name?: string
          customer_notes?: string | null
          customer_phone?: string
          destination_yard_id?: string | null
          id?: string
          netsuite_order_id?: string | null
          order_number?: string
          origin_factory_id?: string | null
          origin_yard_id?: string | null
          pallet_count?: number | null
          priority?: string
          service_date?: string
          status?: Database["public"]["Enums"]["order_status"] | null
          time_window?: Database["public"]["Enums"]["time_window"]
          time_window_custom?: string | null
          type?: Database["public"]["Enums"]["order_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          user_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          max_bin_size: Database["public"]["Enums"]["bin_size"] | null
          max_pallets: number
          name: string
          plate: string
          samsara_id: string | null
          type: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_bin_size?: Database["public"]["Enums"]["bin_size"] | null
          max_pallets?: number
          name: string
          plate: string
          samsara_id?: string | null
          type: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_bin_size?: Database["public"]["Enums"]["bin_size"] | null
          max_pallets?: number
          name?: string
          plate?: string
          samsara_id?: string | null
          type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_order_number: { Args: { svc_date: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "dispatcher" | "driver"
      bin_event: "delivered" | "picked_up" | "swapped_out" | "swapped_in"
      bin_size: "14" | "20" | "40"
      bin_status: "depot" | "in_transit" | "on_site" | "full"
      brick_order_type:
        | "pickup_from_factory"
        | "delivery_to_customer"
        | "factory_to_customer"
      business_type: "garbage" | "brick" | "material"
      order_status:
        | "pending"
        | "assigned"
        | "in_progress"
        | "done"
        | "cancelled"
      order_type: "delivery" | "pickup" | "swap" | "material"
      step_status: "locked" | "pending" | "in_progress" | "done"
      step_type:
        | "depot_pickup"
        | "customer_delivery"
        | "customer_pickup"
        | "dump_site"
      time_window: "AM" | "PM" | "7-9" | "custom"
      user_role: "staff" | "driver"
      vehicle_type: "HINO" | "MACK"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "dispatcher", "driver"],
      bin_event: ["delivered", "picked_up", "swapped_out", "swapped_in"],
      bin_size: ["14", "20", "40"],
      bin_status: ["depot", "in_transit", "on_site", "full"],
      brick_order_type: [
        "pickup_from_factory",
        "delivery_to_customer",
        "factory_to_customer",
      ],
      business_type: ["garbage", "brick", "material"],
      order_status: ["pending", "assigned", "in_progress", "done", "cancelled"],
      order_type: ["delivery", "pickup", "swap", "material"],
      step_status: ["locked", "pending", "in_progress", "done"],
      step_type: [
        "depot_pickup",
        "customer_delivery",
        "customer_pickup",
        "dump_site",
      ],
      time_window: ["AM", "PM", "7-9", "custom"],
      user_role: ["staff", "driver"],
      vehicle_type: ["HINO", "MACK"],
    },
  },
} as const
