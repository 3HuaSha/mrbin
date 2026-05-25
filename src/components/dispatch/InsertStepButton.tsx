import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CommonLocation, Bin } from "@/types/dispatch";

interface InsertStepButtonProps {
  driverId: string;
  position: number;
  isActive: boolean;
  onClose: () => void;
  onInsert: (params: {
    driverId: string;
    position: number;
    location: string;
    stepType: string;
    binId?: string;
    notes?: string;
    orderId?: string;
  }) => void;
  commonLocations: CommonLocation[];
  bins: Bin[];
  adjacentOrderId?: string;
  adjacentOrderType?: string;
}

export function InsertStepButton({
  driverId,
  position,
  isActive,
  onClose,
  onInsert,
  adjacentOrderId,
  adjacentOrderType,
}: InsertStepButtonProps) {
  const [stepType, setStepType] = useState("");
  const [location, setLocation] = useState("");
  const [binSize, setBinSize] = useState("");
  const [notes, setNotes] = useState("");

  const getLocationOptions = () => {
    if (stepType === "pickup_bin" || stepType === "drop_bin") {
      return [
        { value: "3445", label: "3445 Kennedy" },
        { value: "12441", label: "12441 Woodbine" }
      ];
    } else if (stepType === "dump_waste") {
      return [
        { value: "3445", label: "3445 Kennedy" },
        { value: "york1 300", label: "YORK1 Nugget (300)" },
        { value: "63A", label: "63A Medulla" },
        { value: "draglam", label: "Draglam Vaughan" },
        { value: "draglam brampton", label: "Draglam Brampton" },
        { value: "maple waste", label: "Maple Transfer" },
        { value: "york1 whitby", label: "YORK1 Whitby" }
      ];
    } else if (stepType === "load_material") {
      return [
        { value: "3445", label: "3445 Kennedy" },
        { value: "12441", label: "12441 Woodbine" }
      ];
    }
    return [];
  };

  const handleInsert = () => {
    if (!stepType) {
      toast.error("请选择动作");
      return;
    }
    if (stepType !== "load_material" && !location) {
      toast.error("请选择地点");
      return;
    }
    if (stepType !== "dump_waste" && stepType !== "load_material" && !binSize) {
      toast.error("请选择桶大小");
      return;
    }
    
    const finalNotes = stepType === "dump_waste" || stepType === "load_material"
      ? notes
      : (notes ? `${binSize}yd - ${notes}` : `${binSize}yd`);
    
    // 装料步骤: 如果相邻的是砂石料订单，自动关联
    // 倒垃圾步骤: 如果相邻的是收桶/换桶订单，自动关联
    let linkedOrderId: string | undefined;
    if (stepType === "load_material" && adjacentOrderId && adjacentOrderType === 'material') {
      linkedOrderId = adjacentOrderId;
    } else if (stepType === "dump_waste" && adjacentOrderId && (adjacentOrderType === 'pickup' || adjacentOrderType === 'swap')) {
      linkedOrderId = adjacentOrderId;
    }
    
    onInsert({ driverId, position, location, stepType, notes: finalNotes || undefined, orderId: linkedOrderId });
    
    setStepType("");
    setLocation("");
    setBinSize("");
    setNotes("");
  };

  const handleStepTypeChange = (value: string) => {
    setStepType(value);
    setLocation("");
  };

  if (!isActive) return null;

  const locationOptions = getLocationOptions();

  return (
    <div className="w-[200px] p-2.5 border-2 border-primary rounded-lg bg-card shadow-2xl space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-primary">插入步骤</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          ✕
        </button>
      </div>
      
      <div>
        <Label className="text-[10px] font-medium">动作</Label>
        <Select value={stepType} onValueChange={handleStepTypeChange}>
          <SelectTrigger className="mt-0.5 h-7 text-[10px]">
            <SelectValue placeholder="选择动作" />
          </SelectTrigger>
          <SelectContent className="z-[110]">
            <SelectItem value="drop_bin" className="text-[10px]">放下桶</SelectItem>
            <SelectItem value="pickup_bin" className="text-[10px]">取走桶</SelectItem>
            <SelectItem value="dump_waste" className="text-[10px]">倒垃圾</SelectItem>
            <SelectItem value="load_material" className="text-[10px]">装料</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {stepType === 'dump_waste' && adjacentOrderId && (adjacentOrderType === 'pickup' || adjacentOrderType === 'swap') && (
        <div className="text-[9px] text-amber-700 bg-amber-50 rounded px-1.5 py-1">
          🔗 将自动关联相邻的收桶订单
        </div>
      )}
      {stepType === 'load_material' && adjacentOrderId && adjacentOrderType === 'material' && (
        <div className="text-[9px] text-amber-700 bg-amber-50 rounded px-1.5 py-1">
          🔗 将自动关联相邻的送料订单
        </div>
      )}
      
      {stepType && (
        <div>
          <Label className="text-[10px] font-medium">地点</Label>
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className="mt-0.5 h-7 text-[10px]">
              <SelectValue placeholder="选择地点" />
            </SelectTrigger>
            <SelectContent className="z-[110]">
              {locationOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-[10px]">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      
      {stepType !== "dump_waste" && stepType !== "load_material" && (
        <div>
          <Label className="text-[10px] font-medium">桶大小</Label>
          <Select value={binSize} onValueChange={setBinSize}>
            <SelectTrigger className="mt-0.5 h-7 text-[10px]">
              <SelectValue placeholder="选择桶大小" />
            </SelectTrigger>
            <SelectContent className="z-[110]">
              <SelectItem value="14" className="text-[10px]">14 yd</SelectItem>
              <SelectItem value="20" className="text-[10px]">20 yd</SelectItem>
              <SelectItem value="30" className="text-[10px]">30 yd</SelectItem>
              <SelectItem value="40" className="text-[10px]">40 yd</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      
      <div>
        <Label className="text-[10px] font-medium">备注 (可选)</Label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="备注"
          className="w-full h-7 px-1.5 rounded-md border bg-background text-[10px] mt-0.5"
        />
      </div>
      
      <div className="flex gap-1.5 pt-0.5">
        <Button size="sm" onClick={handleInsert} className="flex-1 h-7 text-[10px] font-medium">
          确认
        </Button>
        <Button size="sm" variant="outline" onClick={onClose} className="h-7 text-[10px]">
          取消
        </Button>
      </div>
    </div>
  );
}
