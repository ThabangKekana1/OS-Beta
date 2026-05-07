import Image from "next/image";
import { cn } from "@/lib/utils";

type DawnAvatarProps = {
  className?: string;
  imageClassName?: string;
};

export function DawnAvatar({ className, imageClassName }: DawnAvatarProps) {
  return (
    <span
      role="img"
      aria-label="Dawn"
      className={cn(
        "flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/68",
        className,
      )}
    >
      <Image
        src="/dawn-icon.svg"
        alt=""
        aria-hidden="true"
        width={20}
        height={20}
        className={cn("size-5 object-contain", imageClassName)}
      />
    </span>
  );
}