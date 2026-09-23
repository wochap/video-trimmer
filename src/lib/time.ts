export const MICROS_PER_SECOND = 1_000_000;
export const secondsToMicros = (seconds: number) =>
  Math.max(0, Math.round(seconds * MICROS_PER_SECOND));
export const microsToSeconds = (micros: number) => micros / MICROS_PER_SECOND;
export function formatMicros(micros: number) {
  const ms = Math.max(0, Math.round(micros / 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h ? `${h}:${String(m).padStart(2, "0")}:` : `${m}:`}${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}
export const frameStepMicros = (fps: number) =>
  Math.max(1, Math.round(MICROS_PER_SECOND / (fps > 0 ? fps : 30)));
export function clampRange(
  start: number,
  end: number,
  duration: number,
  step: number,
) {
  const d = Math.max(step, duration);
  const s = Math.max(0, Math.min(start, d - step));
  return { start: s, end: Math.max(s + step, Math.min(end, d)) };
}
/**
 * Parses `h:mm:ss.mmm`, `m:ss.mmm`, `ss.mmm`, or `ss` into microseconds.
 * Returns `null` for anything else.
 */
export function parseTimecode(text: string): number | null {
  const m = /^(?:(?:(\d+):)?(\d+):)?(\d+)(?:\.(\d{1,6}))?$/.exec(text.trim());
  if (!m) return null;
  const [, h, min, s, frac = ""] = m;
  // Sub-units must stay below 60 once a larger unit is written.
  if (min !== undefined && Number(s) >= 60) return null;
  if (h !== undefined && Number(min) >= 60) return null;
  const seconds = Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s);
  return seconds * MICROS_PER_SECOND + Number(frac.padEnd(6, "0"));
}
/** Coarse remaining time: `about 6 s left`, `about 3 min left`, `about 1 h 5 min left`. */
export function formatRemaining(micros: number) {
  const s = Math.max(1, Math.round(micros / MICROS_PER_SECOND));
  if (s < 60) return `about ${s} s left`;
  const min = Math.round(s / 60);
  if (min < 60) return `about ${min} min left`;
  return `about ${Math.floor(min / 60)} h ${min % 60} min left`;
}
