import type { ReactNode } from "react";
import { FolderOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
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
          <Upload size={28} strokeWidth={1.6} />
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
            <FolderOpen size={16} /> Choose video…
          </Button>
          <span className="flex items-center gap-[5px] text-xs text-neutral-500">
            or press <Kbd>Enter</Kbd> <Kbd>Ctrl O</Kbd>
          </span>
        </div>
      </div>
    </Backdrop>
  );
}
/** Screen 3b: the chosen file is being probed. */
export function Inspecting() {
  return (
    <Backdrop>
      <div className="box-border flex aspect-video h-full max-w-full items-end rounded-sm bg-linear-to-b from-neutral-800 to-neutral-900 p-6 shadow-sm">
        <div className="flex w-full max-w-[340px] flex-col gap-2.5">
          <p className="text-[15px] font-medium">Inspecting video…</p>
          <div
            role="progressbar"
            aria-label="Inspecting video"
            className="relative h-[3px] overflow-hidden rounded-xs bg-neutral-700"
          >
            <div className="absolute inset-y-0 left-0 w-[38%] animate-[inspect_1.4s_ease-in-out_infinite] rounded-xs bg-accent shadow-[0_0_10px_var(--color-accent)]" />
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
export function VideoStage({ children }: { children: ReactNode }) {
  return <Backdrop>{children}</Backdrop>;
}
