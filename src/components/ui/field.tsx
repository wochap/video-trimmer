import * as React from "react";
import { cn } from "@/lib/utils";
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "min-h-9 w-full min-w-0 rounded-md border border-divider bg-surface px-2.5 py-1.5 text-sm text-text caret-accent placeholder:text-neutral-600 hover:border-text/45 focus-visible:border-accent focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-45",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
/** Label above a control. `htmlFor` links the label when the control is a single input. */
export function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <Label htmlFor={htmlFor} className="mb-[5px] block text-xs text-text/70">
        {label}
      </Label>
      {children}
    </div>
  );
}
