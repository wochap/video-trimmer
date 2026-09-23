import type { ReactNode } from "react";
import { Check, FolderOpen, UploadSimple } from "@phosphor-icons/react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { INSPECT_STEPS, type InspectStep } from "@/lib/types";
function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[radial-gradient(ellipse_at_50%_40%,var(--color-surface),var(--color-bg)_70%)] p-5">
      {children}
    </div>
  );
}
/** Screen 3a: drop target for the first video. */
export function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <Backdrop>
      <div className="flex w-full max-w-[560px] flex-col items-start gap-3.5 rounded-lg border-[1.5px] border-dashed border-neutral-700 bg-surface/60 px-9 py-10">
        <div className="flex size-[52px] items-center justify-center rounded-md bg-accent-900 text-accent-300 shadow-[0_0_24px_color-mix(in_srgb,var(--color-accent)_25%,transparent)]">
          <Icon icon={UploadSimple} size={28} />
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl leading-tight font-medium">
            Drop an MP4 here
          </h2>
          <p className="text-[13px] text-pretty text-neutral-400">
            One file at a time. Nothing is changed until you trim.
          </p>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <Button variant="primary" onClick={onOpen}>
            <Icon icon={FolderOpen} /> Choose video…
          </Button>
          <span className="flex items-center gap-[5px] text-xs text-neutral-500">
            or press <Kbd>Enter</Kbd> <Kbd>Ctrl O</Kbd>
          </span>
        </div>
      </div>
    </Backdrop>
  );
}
/** Screen 3b: the chosen file is being probed; `step` is the active step. */
export function Inspecting({
  step,
  fraction,
}: {
  step: InspectStep | null;
  fraction: number;
}) {
  const active = step ? INSPECT_STEPS.indexOf(step) : 0;
  const percent = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <Backdrop>
      <div className="box-border flex aspect-video h-full max-w-full items-end rounded-sm bg-linear-to-b from-neutral-800 to-neutral-900 p-6 shadow-sm">
        <div className="flex w-full max-w-[340px] flex-col gap-2.5">
          <p className="text-[15px] font-medium">Inspecting video…</p>
          <ol aria-label="Inspection steps" className="flex flex-col gap-1.5">
            {INSPECT_STEPS.map((name, i) => {
              const state =
                i < active ? "done" : i === active ? "active" : "pending";
              return (
                <li
                  key={name}
                  data-state={state}
                  aria-current={state === "active" ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 text-[12.5px]",
                    state === "done" && "text-neutral-400",
                    state === "active" && "text-text",
                    state === "pending" && "text-neutral-600",
                  )}
                >
                  <span className="grid size-3.5 place-items-center">
                    {state === "done" ? (
                      <Icon
                        icon={Check}
                        size={13}
                        weight="bold"
                        className="text-accent-300"
                      />
                    ) : (
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          state === "active"
                            ? "bg-accent shadow-[0_0_8px_var(--color-accent)]"
                            : "bg-neutral-700",
                        )}
                      />
                    )}
                  </span>
                  {name}
                </li>
              );
            })}
          </ol>
          <div
            role="progressbar"
            aria-label="Inspecting video"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="relative h-[3px] overflow-hidden rounded-xs bg-neutral-700"
          >
            <div
              className="absolute inset-y-0 left-0 rounded-xs bg-accent shadow-[0_0_10px_var(--color-accent)] transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
export function VideoStage({ children }: { children: ReactNode }) {
  return <Backdrop>{children}</Backdrop>;
}
