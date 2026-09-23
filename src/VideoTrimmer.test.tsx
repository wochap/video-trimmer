import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LaunchOptions, VideoMetadata } from "@/lib/types";
type DragDropEvent = { payload: { type: string; paths: string[] } };
const h = vi.hoisted(() => ({
  launch: vi.fn(),
  load: vi.fn(),
  playback: vi.fn(),
  exportVideo: vi.fn(),
  cancel: vi.fn(),
  exit: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
  drag: undefined as undefined | ((event: DragDropEvent) => void),
}));
vi.mock("@/lib/backend", () => ({
  backend: {
    launchOptions: h.launch,
    loadInput: h.load,
    playbackAcceleration: h.playback,
    exportVideo: h.exportVideo,
    cancelExport: h.cancel,
    exit: h.exit,
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: h.open, save: h.save }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: vi.fn(async (cb: (event: DragDropEvent) => void) => {
      h.drag = cb;
      return () => {};
    }),
  }),
}));
import VideoTrimmer from "./VideoTrimmer";
const launch: LaunchOptions = {
  input: null,
  output: null,
  format: "mp4",
  quality: "original",
  onDone: "exit",
  verbose: false,
};
const metadata = (
  path = "/videos/one.mp4",
  warning?: string,
): VideoMetadata => ({
  path,
  previewUrl: "http://127.0.0.1:9/media",
  durationMicros: 2_000_000,
  width: 640,
  height: 360,
  codec: "h264",
  frameRate: 25,
  hasAudio: true,
  thumbnails: warning ? [] : ["asset://thumb.jpg"],
  thumbnailWarning: warning,
  playbackAcceleration: [{ component: "playback_decode", state: "unknown" }],
  keyframesMicros: [0, 1_000_000],
});
beforeEach(() => {
  vi.clearAllMocks();
  h.drag = undefined;
  h.launch.mockResolvedValue(launch);
  h.load.mockResolvedValue(metadata());
  h.playback.mockResolvedValue([
    { component: "playback_decode", state: "unknown" },
  ]);
  h.open.mockResolvedValue(null);
  h.save.mockResolvedValue(null);
});
async function ready(video = metadata()) {
  h.load.mockResolvedValueOnce(video);
  render(<VideoTrimmer />);
  await userEvent.click(
    await screen.findByRole("button", { name: /open an mp4 video/i }),
  );
}
describe("video loading shell", () => {
  it("keeps the empty state when the picker is cancelled", async () => {
    render(<VideoTrimmer />);
    await userEvent.click(
      await screen.findByRole("button", { name: /open an mp4 video/i }),
    );
    expect(h.load).not.toHaveBeenCalled();
    expect(screen.getByText("Open an MP4 video")).toBeVisible();
  });
  it("loads picker and CLI input through the same backend path", async () => {
    h.open.mockResolvedValueOnce("/videos/picked.mp4");
    render(<VideoTrimmer />);
    await userEvent.click(
      await screen.findByRole("button", { name: /open an mp4 video/i }),
    );
    await waitFor(() =>
      expect(h.load).toHaveBeenCalledWith("/videos/picked.mp4"),
    );
    expect(await screen.findByText("/videos/one.mp4")).toBeVisible();
    h.launch.mockResolvedValueOnce({ ...launch, input: "/videos/cli.mp4" });
    render(<VideoTrimmer />);
    await waitFor(() => expect(h.load).toHaveBeenCalledWith("/videos/cli.mp4"));
  });
  it("accepts one MP4 drop and rejects multiple paths", async () => {
    render(<VideoTrimmer />);
    await waitFor(() => expect(h.drag).toBeTypeOf("function"));
    act(() =>
      h.drag!({
        payload: { type: "drop", paths: ["/videos/drop.mp4"] },
      } as DragDropEvent),
    );
    await waitFor(() =>
      expect(h.load).toHaveBeenCalledWith("/videos/drop.mp4"),
    );
    act(() =>
      h.drag!({
        payload: { type: "drop", paths: ["a.mp4", "b.mp4"] },
      } as DragDropEvent),
    );
    expect(await screen.findByText("Drop exactly one MP4 file.")).toBeVisible();
  });
  it("reports preview and thumbnail degradation and can replace the input", async () => {
    h.open.mockResolvedValueOnce("/videos/one.mp4");
    await ready(metadata("/videos/one.mp4", "Timeline thumbnails unavailable"));
    expect(
      await screen.findByText("Timeline thumbnails unavailable"),
    ).toBeVisible();
    fireEvent.error(document.querySelector("video")!);
    expect(screen.getByRole("status")).toHaveTextContent("cannot preview");
    h.open.mockResolvedValueOnce("/videos/two.mp4");
    h.load.mockResolvedValueOnce(metadata("/videos/two.mp4"));
    await userEvent.click(screen.getByRole("button", { name: /replace/i }));
    expect(await screen.findByText("/videos/two.mp4")).toBeVisible();
  });
});
describe("editor workflows", () => {
  it("seeks to the active boundary for pointer and keyboard adjustments", async () => {
    h.open.mockResolvedValueOnce("/videos/one.mp4");
    await ready();
    const video = document.querySelector("video")!;
    fireEvent.loadedMetadata(video);
    const startHandle = screen.getByRole("slider", { name: "Trim start" });
    const track = startHandle.parentElement!;
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

    fireEvent.pointerDown(startHandle, { clientX: 25, pointerId: 1 });
    expect(video.currentTime).toBeCloseTo(0.5);
    expect(startHandle).toHaveAttribute("aria-valuenow", "500000");

    const endHandle = screen.getByRole("slider", { name: "Trim end" });
    fireEvent.pointerDown(endHandle, { clientX: 75, pointerId: 2 });
    expect(video.currentTime).toBeCloseTo(1.5);
    expect(endHandle).toHaveAttribute("aria-valuenow", "1500000");

    fireEvent.keyDown(startHandle, { key: "End" });
    expect(video.currentTime).toBeCloseTo(1.46);
    expect(startHandle).toHaveAttribute("aria-valuenow", "1460000");

    fireEvent.keyDown(endHandle, { key: "Home" });
    expect(video.currentTime).toBeCloseTo(1.5);
    expect(endHandle).toHaveAttribute("aria-valuenow", "1500000");
  });

  it("plays and stops each selection preview at its exact endpoint", async () => {
    h.open.mockResolvedValueOnce("/videos/one.mp4");
    await ready({ ...metadata(), durationMicros: 6_000_000 });
    const video = document.querySelector("video")!;
    fireEvent.loadedMetadata(video);

    await userEvent.click(
      screen.getByRole("button", { name: "Preview start" }),
    );
    expect(video.currentTime).toBe(0);
    expect(video.play).toHaveBeenCalledTimes(1);
    video.currentTime = 2.2;
    fireEvent.timeUpdate(video);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(2);

    await userEvent.click(
      screen.getByRole("button", { name: "Play selection" }),
    );
    expect(video.currentTime).toBe(0);
    video.currentTime = 6;
    fireEvent.ended(video);
    expect(video.pause).toHaveBeenCalledTimes(2);
    expect(video.currentTime).toBe(6);

    await userEvent.click(screen.getByRole("button", { name: "Preview end" }));
    expect(video.currentTime).toBe(4);
    video.currentTime = 6.1;
    fireEvent.timeUpdate(video);
    expect(video.pause).toHaveBeenCalledTimes(3);
    expect(video.currentTime).toBe(6);
  });

  it("clips both edge previews to a selection shorter than two seconds", async () => {
    h.open.mockResolvedValueOnce("/videos/one.mp4");
    await ready({ ...metadata(), durationMicros: 1_500_000 });
    const video = document.querySelector("video")!;
    fireEvent.loadedMetadata(video);

    await userEvent.click(
      screen.getByRole("button", { name: "Preview start" }),
    );
    expect(video.currentTime).toBe(0);
    video.currentTime = 1.6;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toBe(1.5);

    await userEvent.click(screen.getByRole("button", { name: "Preview end" }));
    expect(video.currentTime).toBe(0);
    video.currentTime = 1.6;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toBe(1.5);
  });

  it("replaces an active interval and clears it for unrelated seeking", async () => {
    h.open.mockResolvedValueOnce("/videos/one.mp4");
    await ready({ ...metadata(), durationMicros: 6_000_000 });
    const video = document.querySelector("video")!;
    fireEvent.loadedMetadata(video);

    await userEvent.click(
      screen.getByRole("button", { name: "Preview start" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Play selection" }),
    );
    video.currentTime = 2.2;
    fireEvent.timeUpdate(video);
    expect(video.pause).not.toHaveBeenCalled();
    video.currentTime = 6.1;
    fireEvent.timeUpdate(video);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(6);

    await userEvent.click(
      screen.getByRole("button", { name: "Preview start" }),
    );
    video.currentTime = 1;
    fireEvent.seeking(video);
    video.currentTime = 2.2;
    fireEvent.timeUpdate(video);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it("keeps the selection stop after dragging to a rounded preview start", async () => {
    h.open.mockResolvedValueOnce("/videos/one.mp4");
    await ready({ ...metadata(), durationMicros: 6_000_000 });
    const video = document.querySelector("video")!;
    fireEvent.loadedMetadata(video);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Trim start" }), {
      key: "ArrowRight",
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Play selection" }),
    );
    video.currentTime = 0.0405;
    fireEvent.seeking(video);
    fireEvent.seeking(video);
    video.currentTime = 6.1;
    fireEvent.timeUpdate(video);

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(6);
  });

  it("disables selection previews until playable and while exporting", async () => {
    h.open.mockResolvedValueOnce("/videos/one.mp4");
    h.save.mockResolvedValueOnce("/videos/out.mp4");
    h.exportVideo.mockReturnValue(new Promise(() => {}));
    await ready();
    const controls = ["Preview start", "Play selection", "Preview end"].map(
      (name) => screen.getByRole("button", { name }),
    );
    for (const control of controls) expect(control).toBeDisabled();

    fireEvent.loadedMetadata(document.querySelector("video")!);
    for (const control of controls) expect(control).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: /trim/i }));
    await screen.findByText("Preparing · 0%");
    for (const control of controls) expect(control).toBeDisabled();
  });

  it("supports keyboard seeking, range changes, opening, and immediate cancellation", async () => {
    h.open.mockResolvedValueOnce("/videos/one.mp4");
    await ready();
    const video = document.querySelector("video")!;
    fireEvent.loadedMetadata(video);
    video.currentTime = 1;
    fireEvent.timeUpdate(video);
    fireEvent.keyDown(window, { key: "i" });
    expect(screen.getByRole("slider", { name: "Trim start" })).toHaveAttribute(
      "aria-valuenow",
      "1000000",
    );
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(video.currentTime).toBeCloseTo(1.04);
    fireEvent.keyDown(window, { key: "o", ctrlKey: true });
    await waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(h.exit).toHaveBeenCalledWith(130);
  });
  it("requires confirmation and cancels an active export", async () => {
    h.open.mockResolvedValueOnce("/videos/one.mp4");
    h.save.mockResolvedValueOnce("/videos/out.mp4");
    h.exportVideo.mockReturnValue(new Promise(() => {}));
    await ready();
    fireEvent.loadedMetadata(document.querySelector("video")!);
    await userEvent.click(screen.getByRole("button", { name: /trim/i }));
    await screen.findByText("Preparing · 0%");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel export" }),
    );
    expect(h.cancel).toHaveBeenCalled();
  });
  it("exits after a successful export with the exit policy", async () => {
    h.open.mockResolvedValueOnce("/videos/one.mp4");
    h.save.mockResolvedValueOnce("/videos/one_trim.mp4");
    h.exportVideo.mockResolvedValueOnce({
      output: "/videos/one_trim.mp4",
      acceleration: [],
      effectiveStartMicros: 0,
    });
    await ready();
    fireEvent.loadedMetadata(document.querySelector("video")!);
    await userEvent.click(screen.getByRole("button", { name: /trim/i }));
    await waitFor(() => expect(h.exit).toHaveBeenCalledWith(0));
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "/videos/one_trim.mp4" }),
    );
    expect(h.exportVideo).toHaveBeenCalledWith({
      input: "/videos/one.mp4",
      output: "/videos/one_trim.mp4",
      startMicros: 0,
      endMicros: 2_000_000,
      format: "mp4",
      quality: "original",
    });
  });
  it("stays open after a successful export with the stay policy", async () => {
    h.launch.mockResolvedValueOnce({
      ...launch,
      format: "gif",
      quality: "small",
      onDone: "stay",
    });
    h.open.mockResolvedValueOnce("/videos/one.mp4");
    h.save.mockResolvedValue("/videos/one_trim.gif");
    h.exportVideo.mockResolvedValue({
      output: "/videos/one_trim.gif",
      acceleration: [],
      effectiveStartMicros: 0,
    });
    await ready();
    fireEvent.loadedMetadata(document.querySelector("video")!);
    await userEvent.click(screen.getByRole("button", { name: /trim/i }));
    expect(await screen.findByText("Saved /videos/one_trim.gif")).toBeVisible();
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "/videos/one_trim.gif" }),
    );
    expect(h.exportVideo).toHaveBeenCalledWith(
      expect.objectContaining({ format: "gif", quality: "small" }),
    );
    expect(h.exit).not.toHaveBeenCalled();
    expect(screen.getByText("/videos/one.mp4")).toBeVisible();
    const trim = screen.getByRole("button", { name: /trim/i });
    expect(trim).toBeEnabled();
    await userEvent.click(trim);
    await waitFor(() => expect(h.exportVideo).toHaveBeenCalledTimes(2));
    expect(h.exit).not.toHaveBeenCalled();
  });
});
