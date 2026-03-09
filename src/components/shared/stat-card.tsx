import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
}

export function StatCard({ label, value, subtitle, icon }: StatCardProps) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
