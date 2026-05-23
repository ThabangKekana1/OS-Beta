import { cn } from "@/lib/utils";

type BrandMarkOneOSProps = {
  className?: string;
  withMark?: boolean;
};

export function BrandMarkOneOS({ className, withMark = true }: BrandMarkOneOSProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {withMark ? (
        <span className="relative flex size-6 items-center justify-center rounded-md border border-white/24 bg-[#0a0a0a]">
          <span className="size-2 rounded-[2px] bg-white" />
          <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-white/80" />
        </span>
      ) : null}
      <span className="wordmark-centauri text-[1.02rem] text-white">1OS</span>
    </div>
  );
}
