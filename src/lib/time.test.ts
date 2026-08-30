import { describe, expect, it } from "vitest";
import {
  clampRange,
  formatMicros,
  frameStepMicros,
  secondsToMicros,
} from "./time";
describe("integer media time", () => {
  it("rounds seconds to integer microseconds", () =>
    expect(secondsToMicros(1.2345674)).toBe(1_234_567));
  it("formats milliseconds", () =>
    expect(formatMicros(62_003_000)).toBe("1:02.003"));
  it("derives NTSC-like frame steps", () =>
    expect(frameStepMicros(30000 / 1001)).toBe(33367));
  it("keeps at least one frame between handles", () =>
    expect(clampRange(999, 1000, 1000, 34)).toEqual({ start: 966, end: 1000 }));
});
