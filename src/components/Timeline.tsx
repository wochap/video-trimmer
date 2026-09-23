import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { formatMicros } from "@/lib/time";
type Props = {
  duration: number;
  start: number;
  end: number;
  playhead: number;
  step: number;
  thumbnails: string[];
  onSeek: (v: number) => void;
  onRange: (s: number, e: number, boundary: "start" | "end") => void;
};
export function Timeline({
  duration,
  start,
  end,
  playhead,
  step,
  thumbnails,
  onSeek,
  onRange,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = (v: number) => `${duration ? (100 * v) / duration : 0}%`;
  const at = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(
        duration,
        Math.round(((e.clientX - r.left) / r.width) * duration),
      ),
    );
  };
  const drag = (which: "start" | "end", e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const v = at(e);
    which === "start"
      ? onRange(Math.min(v, end - step), end, which)
      : onRange(start, Math.max(v, start + step), which);
  };
  const key = (which: "start" | "end", e: KeyboardEvent) => {
    let v = which === "start" ? start : end;
    if (e.key === "ArrowLeft") v -= step;
    else if (e.key === "ArrowRight") v += step;
    else if (e.key === "Home") v = which === "start" ? 0 : start + step;
    else if (e.key === "End") v = which === "end" ? duration : end - step;
    else return;
    e.preventDefault();
    which === "start"
      ? onRange(Math.max(0, Math.min(v, end - step)), end, which)
      : onRange(start, Math.min(duration, Math.max(v, start + step)), which);
  };
  return (
    <div>
      <div
        ref={ref}
        className="relative h-20 touch-none overflow-visible rounded-md border bg-muted"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onSeek(at(e));
        }}
        onPointerMove={(e) => {
          if (e.buttons && e.target === e.currentTarget) onSeek(at(e));
        }}
      >
        {thumbnails.length ? (
          <div className="pointer-events-none absolute inset-0 flex overflow-hidden rounded-md">
            {thumbnails.map((t, i) => (
              <img
                key={i}
                src={t}
                alt=""
                className="h-full min-w-0 flex-1 object-cover"
              />
            ))}
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-800 to-slate-600" />
        )}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-black/60"
          style={{ width: pct(start) }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-black/60"
          style={{ width: pct(duration - end) }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-white shadow"
          style={{ left: pct(playhead) }}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Trim start"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, end - step)}
          aria-valuenow={start}
          aria-valuetext={formatMicros(start)}
          className="timeline-handle"
          style={{ left: pct(start) }}
          onPointerDown={(e) => {
            e.stopPropagation();
            drag("start", e);
          }}
          onPointerMove={(e) => e.buttons && drag("start", e)}
          onKeyDown={(e) => key("start", e)}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Trim end"
          aria-valuemin={start + step}
          aria-valuemax={duration}
          aria-valuenow={end}
          aria-valuetext={formatMicros(end)}
          className="timeline-handle"
          style={{ left: pct(end) }}
          onPointerDown={(e) => {
            e.stopPropagation();
            drag("end", e);
          }}
          onPointerMove={(e) => e.buttons && drag("end", e)}
          onKeyDown={(e) => key("end", e)}
        />
      </div>
      <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground">
        <span>{formatMicros(start)}</span>
        <span>{formatMicros(playhead)}</span>
        <span>{formatMicros(end)}</span>
      </div>
    </div>
  );
}
