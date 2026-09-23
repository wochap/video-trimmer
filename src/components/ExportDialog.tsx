import * as A from "@radix-ui/react-alert-dialog";
import { splitPath } from "@/lib/output";
import { formatMicros } from "@/lib/time";
import type { ExportProgress } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
/** Screen 3d: blocking progress while FFmpeg writes the output. */
export function ExportDialog({
  open,
  output,
  length,
  progress,
  onCancel,
}: {
  open: boolean;
  output: string;
  /** Selection length in microseconds. */
  length: number;
  progress: ExportProgress | null;
  onCancel: () => void;
}) {
  const percent = Math.round((progress?.fraction ?? 0) * 100);
  const { dir, name } = splitPath(output);
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
            <span
              aria-hidden
              className="font-mono text-[28px] leading-tight font-medium text-accent-200"
            >
              {percent}%
            </span>
            <Progress value={percent} />
            <span className="font-mono text-[11.5px] text-neutral-500">
              {formatMicros(Math.min(progress?.outTimeMicros ?? 0, length))} /{" "}
              {formatMicros(length)}
            </span>
          </div>
          <p className="flex items-center gap-2 text-[12.5px]">
            <span className="flex w-3.5 justify-center">
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
            </span>
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
