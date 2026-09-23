import * as A from "@radix-ui/react-alert-dialog";
import { Check } from "@phosphor-icons/react";
import { Icon } from "@/components/ui/icon";
import { useEffect, useState } from "react";
import { formatBytes, splitPath } from "@/lib/output";
import { formatMicros, formatRemaining } from "@/lib/time";
import {
  exportSteps,
  SEEK_STEP,
  type ExportFormat,
  type ExportProgress,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
/** Time remaining is too noisy to show before this fraction. */
const ETA_MIN_FRACTION = 0.05;
/** Screen 3d: blocking progress while FFmpeg writes the output. */
export function ExportDialog({
  open,
  output,
  length,
  format,
  progress,
  onCancel,
}: {
  open: boolean;
  output: string;
  /** Selection length in microseconds. */
  length: number;
  format: ExportFormat;
  progress: ExportProgress | null;
  onCancel: () => void;
}) {
  const fraction = progress?.fraction ?? 0;
  const percent = Math.round(fraction * 100);
  const { dir, name } = splitPath(output);
  // The copy seek step names its keyframe only while active; keep that label
  // for the rest of the export.
  const [seekLabel, setSeekLabel] = useState(SEEK_STEP);
  const current = progress?.step;
  useEffect(() => {
    if (current?.startsWith(SEEK_STEP)) setSeekLabel(current);
  }, [current]);
  const steps = exportSteps(format);
  const active = Math.max(
    0,
    steps.findIndex((s) => current?.startsWith(s)),
  );
  const remaining =
    progress?.remainingMicros != null && fraction >= ETA_MIN_FRACTION
      ? formatRemaining(progress.remainingMicros)
      : null;
  const estimate =
    progress?.estimatedBytes != null
      ? ` of ${progress.approximate ? "≈ " : ""}${formatBytes(progress.estimatedBytes)}`
      : "";
  return (
    <A.Root open={open}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-40 bg-bg/72 backdrop-blur-[6px]" />
        <A.Content
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            onCancel();
          }}
          className="fixed top-1/2 left-1/2 z-40 flex w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg bg-surface p-6 shadow-lg"
        >
          <div className="flex flex-col gap-1">
            <A.Title className="text-lg font-medium">Trimming…</A.Title>
            <A.Description className="truncate text-[12.5px] text-neutral-400">
              {name} → {dir}
            </A.Description>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span
                aria-hidden
                className="font-mono text-[28px] leading-tight font-medium text-accent-200"
              >
                {percent}%
              </span>
              {remaining && (
                <span className="text-[12.5px] text-neutral-400">
                  {remaining}
                </span>
              )}
            </div>
            <Progress value={percent} />
            <div className="flex justify-between gap-3 font-mono text-[11.5px] text-neutral-500">
              <span>
                {formatMicros(Math.min(progress?.outTimeMicros ?? 0, length))} /{" "}
                {formatMicros(length)}
              </span>
              {progress && (
                <span>
                  {formatBytes(progress.bytesWritten)}
                  {estimate}
                </span>
              )}
            </div>
          </div>
          <ol aria-label="Export steps" className="flex flex-col gap-1.5">
            {steps.map((step, i) => {
              const state =
                i < active ? "done" : i === active ? "active" : "pending";
              return (
                <li
                  key={step}
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
                  {step === SEEK_STEP ? seekLabel : step}
                </li>
              );
            })}
          </ol>
          <p className="text-[11.5px] text-neutral-500">
            {progress?.attempt ?? "Preparing"}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <span className="flex items-center gap-[5px] text-[11.5px] text-neutral-500">
              <Kbd>Esc</Kbd>Cancel
            </span>
            <Button className="ml-auto" onClick={onCancel}>
              Cancel trim
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
