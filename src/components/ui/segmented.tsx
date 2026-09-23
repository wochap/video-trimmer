import { useId } from "react";
import { cn } from "@/lib/utils";
export type SegmentedOption<T extends string> = { value: T; label: string };
/** Radio group styled as the Nocturne `.seg` control. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn(
        "flex overflow-hidden rounded-md border border-divider",
        disabled && "opacity-45",
        className,
      )}
    >
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "relative inline-flex flex-1 cursor-pointer items-center justify-center px-3 py-[7px] text-[13px] leading-normal [&+&]:border-l [&+&]:border-divider",
            // Inner radius (group radius minus its 1px border) so the inset ring curves with the clip.
            "first:rounded-l-[7px] last:rounded-r-[7px]",
            "has-checked:text-accent has-checked:shadow-[inset_0_0_0_1px_var(--color-accent)]",
            "not-has-checked:hover:bg-text/7 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent",
            disabled &&
              "cursor-not-allowed not-has-checked:hover:bg-transparent",
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
            className="pointer-events-none absolute size-0 opacity-0"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
