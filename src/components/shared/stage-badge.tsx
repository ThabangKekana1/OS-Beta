import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StageBadgeProps {
  stageName: string;
  stageCode?: string;
  category?: string;
  className?: string;
}

const categoryStyles: Record<string, string> = {
  EARLY_LEAD: "border-white/20 text-white/70",
  REGISTRATION: "border-white/30 text-white/80",
  EXPRESSION_OF_INTEREST: "border-white/40 text-white/80",
  UTILITY_REVIEW: "border-white/40 text-white/80",
  PROPOSAL: "border-white/50 text-white/90",
  TERM_SHEET: "border-white/50 text-white/90",
  KNOW_YOUR_CUSTOMER: "border-white/50 text-white/90",
  APPROVAL: "border-white/60 text-white",
  DELIVERY: "border-white/70 text-white",
  LIVE_SUPPORT: "border-white/80 text-white",
  CLOSED: "border-white/10 text-white/50",
};

export function StageBadge({ stageName, category, className }: StageBadgeProps) {
  const style = category ? categoryStyles[category] ?? "" : "border-white/30 text-white/80";

  return (
    <Badge
      variant="outline"
      className={cn("rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", style, className)}
    >
      {stageName}
    </Badge>
  );
}
