import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StageBadgeProps {
  stageName: string;
  stageCode?: string;
  category?: string;
  className?: string;
}

const categoryStyles: Record<string, string> = {
  EARLY_LEAD: "border-border text-muted-foreground bg-muted/50",
  REGISTRATION: "border-border text-foreground bg-muted/30",
  EXPRESSION_OF_INTEREST: "border-border text-foreground bg-accent/60",
  UTILITY_REVIEW: "border-border text-foreground bg-accent/60",
  PROPOSAL: "border-border text-foreground bg-accent/80",
  TERM_SHEET: "border-border text-foreground bg-accent/80",
  KNOW_YOUR_CUSTOMER: "border-border text-foreground bg-accent/80",
  APPROVAL: "border-border text-foreground bg-foreground/10",
  DELIVERY: "border-border text-foreground bg-foreground/10",
  LIVE_SUPPORT: "border-border text-foreground bg-foreground/10",
  CLOSED: "border-border text-muted-foreground bg-muted/60",
};

export function StageBadge({ stageName, category, className }: StageBadgeProps) {
  const style = category ? categoryStyles[category] ?? "" : "border-border text-foreground bg-muted/40";

  return (
    <Badge
      variant="outline"
      className={cn("rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", style, className)}
    >
      {stageName}
    </Badge>
  );
}
