import { useId } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { AccelerationRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
export function accelerationLabel(records: AccelerationRecord[]) {
  if (records.some((r) => r.state === "active"))
    return "Hardware acceleration active";
  if (records.some((r) => r.state === "software")) return "Software encoding";
  return "Hardware acceleration unknown";
}
/** Status dot plus text; per-component details in a tooltip. */
export function AccelerationBadge({
  records,
}: {
  records: AccelerationRecord[];
}) {
  const detailsId = useId();
  if (records.length === 0) return null;
  const label = accelerationLabel(records),
    active = label.endsWith("active"),
    software = label === "Software encoding";
  const details = records
    .map(
      (r) =>
        `${r.component.replace("_", " ")}: ${r.state}${r.implementation ? ` (${r.implementation})` : ""}${r.reason ? ` — ${r.reason}` : ""}`,
    )
    .join("; ");
  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="flex cursor-default items-center gap-2 rounded-sm text-xs whitespace-nowrap text-neutral-400"
            aria-label={label}
            aria-describedby={detailsId}
          >
            <span id={detailsId} className="sr-only">
              {details}
            </span>
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                active
                  ? "bg-accent shadow-[0_0_8px_var(--color-accent)]"
                  : software
                    ? "bg-neutral-400"
                    : "bg-neutral-600",
              )}
            />
            {label}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={6}
            className="z-50 max-w-xs rounded-md bg-surface p-3 text-xs shadow-md"
          >
            {records.map((r, i) => (
              <div key={`${r.component}-${i}`}>
                <b className="font-medium">{r.component.replace("_", " ")}:</b>{" "}
                {r.state}
                {r.implementation ? ` (${r.implementation})` : ""}
                {r.reason ? ` — ${r.reason}` : ""}
              </div>
            ))}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
