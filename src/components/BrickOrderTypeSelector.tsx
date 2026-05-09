import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { BRICK_ORDER_TYPES, type BrickOrderType } from "@/lib/business";

interface BrickOrderTypeSelectorProps {
  value: BrickOrderType;
  onChange: (value: BrickOrderType) => void;
}

export function BrickOrderTypeSelector({ 
  value, 
  onChange 
}: BrickOrderTypeSelectorProps) {
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as BrickOrderType)}>
      <div className="space-y-3">
        {BRICK_ORDER_TYPES.map((type) => (
          <div key={type.value} className="flex items-start space-x-3 space-y-0">
            <RadioGroupItem value={type.value} id={type.value} />
            <Label 
              htmlFor={type.value} 
              className="font-normal cursor-pointer flex flex-col"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{type.emoji}</span>
                <span className="font-semibold">{type.label}</span>
              </div>
              <span className="text-sm text-muted-foreground">{type.description}</span>
            </Label>
          </div>
        ))}
      </div>
    </RadioGroup>
  );
}
