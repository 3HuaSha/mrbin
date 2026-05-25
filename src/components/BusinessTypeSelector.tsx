import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BUSINESS_TYPES, type BusinessType } from "@/lib/business";
import { cn } from "@/lib/utils";

interface BusinessTypeSelectorProps {
  value: BusinessType;
  onChange: (value: BusinessType) => void;
  className?: string;
}

export function BusinessTypeSelector({ 
  value, 
  onChange, 
  className 
}: BusinessTypeSelectorProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as BusinessType)} className={cn("w-auto", className)}>
      <TabsList className="grid w-full grid-cols-2">
        {BUSINESS_TYPES.map((type) => (
          <TabsTrigger 
            key={type.value} 
            value={type.value}
            className="flex items-center gap-2"
          >
            <span className="text-lg">{type.emoji}</span>
            <span>{type.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
