import { describe, expect, it } from "vitest";
import {
  clampRange,
  formatMicros,
  frameStepMicros,
  parseTimecode,
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
describe("parseTimecode", () => {
  it.each([
    ["0:44.185", 44_185_000],
    ["3:26.020", 206_020_000],
    ["12.5", 12_500_000],
    ["90", 90_000_000],
    ["1:02:03.004", 3_723_004_000],
    [" 7 ", 7_000_000],
  ])("parses %s", (text, micros) => expect(parseTimecode(text)).toBe(micros));
  it.each([
    "",
    "abc",
    "1:",
    ":30",
    "1:60.000",
    "1:60:00",
    "1.2.3",
    "-1",
    "1:2:3:4",
  ])("rejects %j", (text) => expect(parseTimecode(text)).toBeNull());
});
