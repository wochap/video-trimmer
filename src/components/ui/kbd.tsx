import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "rounded-sm border border-divider px-[5px] py-px font-mono text-[10.5px] leading-normal font-medium text-neutral-300",
        className,
      )}
      {...props}
    />
  );
}
