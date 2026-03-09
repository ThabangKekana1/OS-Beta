import { cn } from "@/lib/utils";

interface HealthIndicatorProps {
  status: string;
  showLabel?: boolean;
  className?: string;
}

const statusConfig: Record<string, { dot: string; label: string }> = {
  HEALTHY: { dot: "bg-white", label: "Healthy" },
  AT_RISK: { dot: "bg-white/60 animate-pulse", label: "At Risk" },
  STALLED: { dot: "bg-white/40", label: "Stalled" },
  OVERDUE: { dot: "bg-destructive animate-pulse", label: "Overdue" },
  WAITING_ON_BUSINESS: { dot: "bg-white/50", label: "Waiting on Business" },
  WAITING_ON_ADMINISTRATOR: { dot: "bg-white/50", label: "Waiting on Admin" },
  WAITING_ON_PARTNER: { dot: "bg-white/50", label: "Waiting on Partner" },
};

export function HealthIndicator({ status, showLabel = true, className }: HealthIndicatorProps) {
  const config = statusConfig[status] ?? { dot: "bg-white/30", label: status };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className={cn("h-2 w-2 rounded-full", config.dot)} />
      {showLabel && <span className="text-xs text-muted-foreground">{config.label}</span>}
    </div>
  );
}
