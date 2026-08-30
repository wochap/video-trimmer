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
