import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
// Mirrors the Nocturne `.btn`, `.btn-*` classes.
const variants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 py-1.5 text-sm leading-[1.2] font-medium text-text transition-colors disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:block [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border-accent text-accent hover:bg-accent/12 active:bg-accent/22",
        secondary: "border-divider hover:bg-text/7 active:bg-text/14",
        ghost: "px-[2.8px] text-accent hover:bg-accent/10 active:bg-accent/18",
        danger:
          "border-danger text-danger hover:bg-danger/12 active:bg-danger/22",
      },
      size: { default: "", icon: "size-9 p-0" },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);
export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof variants> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(variants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
