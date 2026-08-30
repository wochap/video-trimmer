import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoMetadata } from "@/lib/types";
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
const launch = { input: null, output: null, force: false, verbose: false };
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
});
