import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface BrickFactory {
  id: string;
  name: string;
  address: string;
  is_active: boolean;
}

interface CompanyYard {
  id: string;
  name: string;
  address: string;
  current_inventory: number;
  is_active: boolean;
}

interface BrickLocationSelectorProps {
  type: 'factory' | 'yard';
  value: string | null;
  onChange: (value: string) => void;
  showInventory?: boolean;
  label?: string;
}

export function BrickLocationSelector({ 
  type, 
  value, 
  onChange,
  showInventory = false,
  label
}: BrickLocationSelectorProps) {
  const { data: factories, isLoading: loadingFactories } = useQuery({
    queryKey: ["brick-factories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brick_factories")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as BrickFactory[];
    },
    enabled: type === 'factory',
  });

  const { data: yards, isLoading: loadingYards } = useQuery({
    queryKey: ["company-yards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_yards")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as CompanyYard[];
    },
    enabled: type === 'yard',
  });

  const isLoading = type === 'factory' ? loadingFactories : loadingYards;
  const locations = type === 'factory' ? factories : yards;

  const displayLabel = label || (type === 'factory' ? '选择砖厂' : '选择场地');

  return (
    <div className="space-y-2">
      <Label>{displayLabel}</Label>
      <Select value={value || undefined} onValueChange={onChange} disabled={isLoading}>
        <SelectTrigger>
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>加载中...</span>
            </div>
          ) : (
            <SelectValue placeholder={`请选择${type === 'factory' ? '砖厂' : '场地'}`} />
          )}
        </SelectTrigger>
        <SelectContent>
          {locations?.map((location) => (
            <SelectItem key={location.id} value={location.id}>
              <div className="flex flex-col">
                <span className="font-medium">{location.name}</span>
                <span className="text-xs text-muted-foreground">{location.address}</span>
                {showInventory && type === 'yard' && 'current_inventory' in location && (
                  <span className="text-xs text-primary">
                    当前库存: {location.current_inventory}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
          {locations?.length === 0 && (
            <div className="p-2 text-sm text-muted-foreground text-center">
              暂无可用{type === 'factory' ? '砖厂' : '场地'}
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
