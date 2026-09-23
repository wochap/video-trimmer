import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
const tones = {
  neutral: "bg-neutral-800 text-neutral-100",
  accent: "bg-accent-800 text-accent-100",
  outline: "border border-accent text-accent",
};
export function Tag({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[6px] px-2.5 py-[3px] text-[11px] leading-normal tracking-[0.02em] whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
