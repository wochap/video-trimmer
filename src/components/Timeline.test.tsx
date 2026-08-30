import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";
describe("Timeline", () => {
  it("exposes independent labelled sliders", () => {
    render(
      <Timeline
        duration={1_000_000}
        start={100_000}
        end={900_000}
        playhead={500_000}
        step={40_000}
        thumbnails={[]}
        onSeek={() => {}}
        onRange={() => {}}
      />,
    );
    expect(screen.getByRole("slider", { name: "Trim start" })).toHaveAttribute(
      "aria-valuemax",
      "860000",
    );
    expect(screen.getByRole("slider", { name: "Trim end" })).toHaveAttribute(
      "aria-valuemin",
      "140000",
    );
  });
  it("keyboard-adjusts only the focused boundary", () => {
    const range = vi.fn();
    render(
      <Timeline
        duration={1_000_000}
        start={100_000}
        end={900_000}
        playhead={500_000}
        step={40_000}
        thumbnails={[]}
        onSeek={() => {}}
        onRange={range}
      />,
    );
    fireEvent.keyDown(screen.getByRole("slider", { name: "Trim start" }), {
      key: "ArrowRight",
    });
    expect(range).toHaveBeenCalledWith(140_000, 900_000);
  });
});
describe("complete timeline interaction", () => {
  it("seeks with the track without changing a boundary", () => {
    const seek = vi.fn(),
      range = vi.fn();
    render(
      <Timeline
        duration={1_000_000}
        start={100_000}
        end={900_000}
        playhead={500_000}
        step={40_000}
        thumbnails={[]}
        onSeek={seek}
        onRange={range}
      />,
    );
    const track = screen.getByRole("slider", {
      name: "Trim start",
    }).parentElement!;
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 100,
      right: 100,
      top: 0,
      bottom: 80,
      height: 80,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(track, { clientX: 25 });
    expect(seek).toHaveBeenCalledWith(250_000);
    expect(range).not.toHaveBeenCalled();
  });
  it("supports Home and End without crossing handles", () => {
    const range = vi.fn();
    render(
      <Timeline
        duration={1_000_000}
        start={100_000}
        end={900_000}
        playhead={500_000}
        step={40_000}
        thumbnails={[]}
        onSeek={() => {}}
        onRange={range}
      />,
    );
    fireEvent.keyDown(screen.getByRole("slider", { name: "Trim start" }), {
      key: "End",
    });
    expect(range).toHaveBeenCalledWith(860_000, 900_000);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Trim end" }), {
      key: "Home",
    });
    expect(range).toHaveBeenCalledWith(100_000, 140_000);
  });
});
