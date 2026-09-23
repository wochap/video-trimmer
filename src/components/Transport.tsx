import {
  CaretLeft,
  CaretRight,
  Pause,
  Play,
  PlayCircle,
  SkipBack,
  SkipForward,
} from "@phosphor-icons/react";
import { formatMicros } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Kbd } from "@/components/ui/kbd";
// Secondary hints drop out first so the bar fits at the 1280px design width.
const HINTS: [string[], string, string?][] = [
  [["Space"], "Play"],
  [["←", "→"], "Frame"],
  [["Shift"], "1 s", "max-[1320px]:hidden"],
  [["I", "O"], "Set in / out"],
  [["Enter"], "Trim", "max-[1320px]:hidden"],
];
export function Transport({
  enabled,
  playing,
  playhead,
  duration,
  onGoToIn,
  onPreviousFrame,
  onToggle,
  onNextFrame,
  onGoToOut,
  onPlaySelection,
}: {
  enabled: boolean;
  playing: boolean;
  playhead: number;
  /** `null` before metadata; `undefined` with no video. */
  duration: number | null | undefined;
  onGoToIn: () => void;
  onPreviousFrame: () => void;
  onToggle: () => void;
  onNextFrame: () => void;
  onGoToOut: () => void;
  onPlaySelection: () => void;
}) {
  const icon = (
    label: string,
    onClick: () => void,
    children: React.ReactNode,
  ) => (
    <Button
      size="icon"
      aria-label={label}
      title={label}
      disabled={!enabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-1.5 border-t border-divider px-4">
      <div className="flex items-center gap-1.5">
        {icon("Go to in", onGoToIn, <Icon icon={SkipBack} />)}
        {icon("Previous frame", onPreviousFrame, <Icon icon={CaretLeft} />)}
        <Button
          size="icon"
          variant="primary"
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause" : "Play"}
          disabled={!enabled}
          onClick={onToggle}
        >
          {playing ? (
            <Icon icon={Pause} weight="fill" />
          ) : (
            <Icon icon={Play} weight="fill" />
          )}
        </Button>
        {icon("Next frame", onNextFrame, <Icon icon={CaretRight} />)}
        {icon("Go to out", onGoToOut, <Icon icon={SkipForward} />)}
        <Button
          variant="ghost"
          className="ml-1 text-[13px]"
          disabled={!enabled}
          onClick={onPlaySelection}
        >
          <Icon icon={PlayCircle} /> Play selection
        </Button>
      </div>
      <div
        aria-label="Playhead"
        className={cn(
          "ml-2.5 font-mono text-[15px] font-medium tracking-[0.02em] whitespace-nowrap tabular-nums",
          !duration && "text-neutral-500",
        )}
      >
        {duration === undefined ? "—:——.———" : formatMicros(playhead)}
        {duration !== undefined && (
          <span className="text-neutral-600">
            {" / "}
            {duration === null ? "—" : formatMicros(duration)}
          </span>
        )}
      </div>
      <ul
        aria-label="Keyboard shortcuts"
        className="ml-auto flex items-center gap-3.5 overflow-hidden text-[11.5px] whitespace-nowrap text-neutral-500 max-[1100px]:hidden"
      >
        {HINTS.map(([keys, action, hide]) => (
          <li key={action} className={cn("flex items-center gap-[5px]", hide)}>
            {keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
            {action}
          </li>
        ))}
      </ul>
    </div>
  );
}
