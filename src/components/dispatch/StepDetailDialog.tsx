import React from "react";
import { Camera, Image as ImageIcon, CheckCircle2, MapPin, Clock } from "lucide-react";
import { JobStep } from "@/types/dispatch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface StepDetailDialogProps {
  step: JobStep;
  onClose: () => void;
}

export function StepDetailDialog({ step, onClose }: StepDetailDialogProps) {
  const stepTypeLabels: Record<string, string> = {
    'depot_pickup': '从仓库取桶',
    'customer_delivery': '送桶到客户',
    'customer_pickup': '从客户取桶',
    'dump_site': '去垃圾场倒垃圾',
    'dump_waste': '倒垃圾',
    'pickup_bin': '取桶',
    'drop_bin': '放桶',
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            任务详情
            <Badge variant={step.status === 'done' ? 'default' : 'outline'} className={step.status === 'done' ? 'bg-green-600' : ''}>
              {step.status === 'done' ? '已完成' : '待处理'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3">
            <div className="mt-1 bg-primary/10 p-2 rounded-full text-primary">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">{stepTypeLabels[step.step_type] || step.step_type}</div>
              <div className="text-xs text-muted-foreground">序号: {step.step_number}</div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-1 bg-primary/10 p-2 rounded-full text-primary">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">地点</div>
              <div className="text-xs text-muted-foreground break-all">{step.location}</div>
            </div>
          </div>

          {step.notes && (
            <div className="bg-muted/50 p-3 rounded-lg border border-dashed">
              <div className="text-xs font-semibold mb-1 flex items-center gap-1">
                📝 备注
              </div>
              <div className="text-sm text-muted-foreground">{step.notes}</div>
            </div>
          )}

          {step.bin_number_reported && (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 p-3 rounded-lg">
              <div className="text-sm font-semibold text-green-800">上报桶号</div>
              <div className="text-sm font-mono font-bold text-green-700">{step.bin_number_reported}</div>
            </div>
          )}

          {(step as any).weight_kg != null && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 p-3 rounded-lg">
              <div className="text-sm font-semibold text-blue-800">称重重量</div>
              <div className="text-sm font-mono font-bold text-blue-700">{(step as any).weight_kg} kg</div>
            </div>
          )}

          {(step as any).dump_site && (
            <div className="bg-muted/50 p-3 rounded-lg border">
              <div className="text-xs font-semibold mb-1">垃圾场</div>
              <div className="text-sm text-muted-foreground">{(step as any).dump_site}</div>
            </div>
          )}

          {step.photo_url && (
            <div className="space-y-2">
              <div className="text-sm font-semibold flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> 现场照片
              </div>
              <div className="aspect-video relative rounded-lg overflow-hidden border shadow-sm group">
                <img 
                  src={step.photo_url} 
                  alt="现场照片" 
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  onClick={() => window.open(step.photo_url!, '_blank')}
                />
              </div>
            </div>
          )}

          {(step as any).weigh_ticket_url && (
            <div className="space-y-2">
              <div className="text-sm font-semibold flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> 垃圾单照片
              </div>
              <div className="aspect-video relative rounded-lg overflow-hidden border shadow-sm group">
                <img
                  src={(step as any).weigh_ticket_url}
                  alt="垃圾单照片"
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  onClick={() => window.open((step as any).weigh_ticket_url, '_blank')}
                />
              </div>
            </div>
          )}

          {(step as any).pickup_photo_url && (
            <div className="space-y-2">
              <div className="text-sm font-semibold flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> 收桶照片
              </div>
              <div className="aspect-video relative rounded-lg overflow-hidden border shadow-sm group">
                <img
                  src={(step as any).pickup_photo_url}
                  alt="收桶照片"
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  onClick={() => window.open((step as any).pickup_photo_url, '_blank')}
                />
              </div>
            </div>
          )}
          
          {step.completed_at && (
            <div className="text-[10px] text-muted-foreground text-right italic">
              完成于: {new Date(step.completed_at).toLocaleString()}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
