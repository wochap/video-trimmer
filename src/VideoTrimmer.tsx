import { useCallback, useEffect, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { FolderOpen, Pause, Play, Scissors, Upload } from "lucide-react";
import { backend } from "@/lib/backend";
import {
  clampRange,
  frameStepMicros,
  microsToSeconds,
  secondsToMicros,
} from "@/lib/time";
import type {
  AccelerationRecord,
  ExportFormat,
  ExportProgress,
  LaunchOptions,
  VideoMetadata,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ConfirmCancel } from "@/components/ui/alert-dialog";
import { Timeline } from "@/components/Timeline";
import { AccelerationBadge } from "@/components/AccelerationBadge";
type Phase = "empty" | "loading" | "ready" | "exporting" | "error";
const mp4 = (p: string) => p.toLowerCase().endsWith(".mp4");
const extension = (format: ExportFormat) =>
  format === "copy" ? "mp4" : format;
// Export records replace earlier export records but keep playback ones.
const withExport = (
  previous: AccelerationRecord[],
  exported: AccelerationRecord[],
) => [
  ...previous.filter((r) => !r.component.startsWith("export_")),
  ...exported,
];
const errorMessage = (error: unknown) =>
  typeof error === "string"
    ? error
    : error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
      ? error.message
      : "An unexpected error occurred.";
export default function VideoTrimmer() {
  const [phase, setPhase] = useState<Phase>("empty"),
    [video, setVideo] = useState<VideoMetadata | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [drag, setDrag] = useState(false),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [playhead, setPlayhead] = useState(0),
    [playing, setPlaying] = useState(false),
    [previewOk, setPreviewOk] = useState(false),
    [progress, setProgress] = useState<ExportProgress | null>(null),
    [confirm, setConfirm] = useState(false),
    [launch, setLaunch] = useState<LaunchOptions>({
      input: null,
      output: null,
      format: "mp4",
      quality: "original",
      onDone: "exit",
      verbose: false,
    }),
    [acceleration, setAcceleration] = useState<AccelerationRecord[]>([]);
  const player = useRef<HTMLVideoElement>(null),
    cancelRequested = useRef(false),
    launchRequested = useRef(false),
    boundedStop = useRef<number | null>(null),
    boundedVersion = useRef(0),
    boundedSeekTarget = useRef<number | null>(null);
  const step = frameStepMicros(video?.frameRate ?? 30);
  const load = useCallback(
    async (path: string) => {
      if (phase === "exporting") return;
      if (!mp4(path)) {
        setError("Choose exactly one local MP4 file.");
        setPhase(video ? "ready" : "error");
        return;
      }
      boundedStop.current = null;
      boundedSeekTarget.current = null;
      boundedVersion.current += 1;
      setPhase("loading");
      setError("");
      setNotice("");
      try {
        const next = await backend.loadInput(path);
        setVideo(next);
        setStart(0);
        setEnd(next.durationMicros);
        setPlayhead(0);
        setPreviewOk(false);
        setAcceleration(next.playbackAcceleration);
        setPhase("ready");
      } catch (e) {
        setError(errorMessage(e));
        setPhase(video ? "ready" : "error");
      }
    },
    [phase, video],
  );
  const pick = useCallback(async () => {
    const p = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "MP4 video", extensions: ["mp4"] }],
    });
    if (typeof p === "string") await load(p);
  }, [load]);
  useEffect(() => {
    if (launchRequested.current) return;
    launchRequested.current = true;
    backend
      .launchOptions()
      .then((o) => {
        setLaunch(o);
        if (o.input) void load(o.input);
      })
      .catch((e) => {
        setError(errorMessage(e));
        setPhase("error");
      });
  }, []);
  useEffect(() => {
    let stop: undefined | (() => void);
    getCurrentWindow()
      .onDragDropEvent((e) => {
        if (phase === "exporting") return;
        if (e.payload.type === "over") setDrag(true);
        else if (e.payload.type === "leave") setDrag(false);
        else {
          setDrag(false);
          const paths = e.payload.paths;
          if (paths.length === 1 && mp4(paths[0])) void load(paths[0]);
          else {
            setError("Drop exactly one MP4 file.");
            if (!video) setPhase("error");
          }
        }
      })
      .then((u) => (stop = u));
    return () => stop?.();
  }, [load, phase, video]);
  useEffect(() => {
    const stops = [
      listen<ExportProgress>("export-progress", (e) => setProgress(e.payload)),
      listen<AccelerationRecord[]>("acceleration-update", (e) =>
        setAcceleration((previous) => withExport(previous, e.payload)),
      ),
    ];
    return () => {
      for (const p of stops) void p.then((u) => u());
    };
  }, []);
  useEffect(() => {
    if (!previewOk) return;
    const refresh = () =>
      void backend
        .playbackAcceleration()
        .then((records) =>
          setAcceleration((previous) => [
            ...records,
            ...previous.filter((r) => r.component.startsWith("export_")),
          ]),
        );
    refresh();
    const id = window.setInterval(refresh, 2000);
    return () => window.clearInterval(id);
  }, [previewOk]);
  const seek = (v: number) => {
    boundedStop.current = null;
    boundedSeekTarget.current = null;
    boundedVersion.current += 1;
    const n = Math.max(0, Math.min(v, video?.durationMicros ?? 0));
    setPlayhead(n);
    if (player.current) player.current.currentTime = microsToSeconds(n);
  };
  const range = (s: number, e: number, boundary?: "start" | "end") => {
    if (!video) return;
    const r = clampRange(s, e, video.durationMicros, step);
    setStart(r.start);
    setEnd(r.end);
    seek(
      boundary === "start"
        ? r.start
        : boundary === "end"
          ? r.end
          : Math.max(r.start, Math.min(playhead, r.end)),
    );
  };
  const playInterval = (intervalStart: number, intervalEnd: number) => {
    const el = player.current;
    if (!el || !video || !previewOk || phase !== "ready") return;
    boundedStop.current = null;
    boundedVersion.current += 1;
    const version = boundedVersion.current;
    boundedSeekTarget.current = intervalStart;
    el.currentTime = microsToSeconds(intervalStart);
    setPlayhead(intervalStart);
    boundedStop.current = intervalEnd;
    void el.play().catch(() => {
      if (boundedVersion.current === version) boundedStop.current = null;
    });
  };
  const stopBoundedPlayback = (el: HTMLVideoElement) => {
    const stop = boundedStop.current;
    if (stop === null) return false;
    boundedStop.current = null;
    boundedSeekTarget.current = stop;
    boundedVersion.current += 1;
    el.pause();
    el.currentTime = microsToSeconds(stop);
    setPlayhead(stop);
    return true;
  };
  const syncPlaybackTime = (el: HTMLVideoElement) => {
    const current = secondsToMicros(el.currentTime);
    setPlayhead(current);
    if (boundedStop.current !== null && current >= boundedStop.current)
      stopBoundedPlayback(el);
  };
  const toggle = () => {
    const el = player.current;
    if (!el) return;
    boundedStop.current = null;
    boundedSeekTarget.current = null;
    boundedVersion.current += 1;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  };
  const trim = useCallback(async () => {
    if (!video || !previewOk || phase === "exporting") return;
    const ext = extension(launch.format);
    let output = launch.output;
    if (!output)
      output = await save({
        defaultPath: `${video.path.replace(/\.mp4$/i, "")}_trim.${ext}`,
        filters: [{ name: `${ext.toUpperCase()} file`, extensions: [ext] }],
      });
    if (!output) return;
    cancelRequested.current = false;
    boundedStop.current = null;
    boundedSeekTarget.current = null;
    boundedVersion.current += 1;
    player.current?.pause();
    setPhase("exporting");
    setProgress({ fraction: 0, outTimeMicros: 0, attempt: "Preparing" });
    setError("");
    setNotice("");
    try {
      const result = await backend.exportVideo({
        input: video.path,
        output,
        startMicros: start,
        endMicros: end,
        format: launch.format,
        quality: launch.quality,
      });
      setAcceleration((previous) => withExport(previous, result.acceleration));
      if (launch.onDone === "exit") {
        await backend.exit(0);
        return;
      }
      setProgress(null);
      setNotice(`Saved ${result.output}`);
      setPhase("ready");
    } catch (e) {
      if (cancelRequested.current) {
        await backend.exit(130);
        return;
      }
      setError(errorMessage(e));
      setPhase("ready");
    }
  }, [video, previewOk, phase, launch, start, end]);
  const cancel = () =>
    phase === "exporting" ? setConfirm(true) : void backend.exit(130);
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.matches("input,textarea,select,[contenteditable=true]") ||
          t.getAttribute("role") === "dialog")
      )
        return;
      if (e.ctrlKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void pick();
        return;
      }
      if (phase !== "ready") return;
      let handled = true;
      if (e.key === " ") toggle();
      else if (e.key === "ArrowLeft")
        seek(playhead - (e.shiftKey ? 1_000_000 : step));
      else if (e.key === "ArrowRight")
        seek(playhead + (e.shiftKey ? 1_000_000 : step));
      else if (e.key.toLowerCase() === "i") range(playhead, end);
      else if (e.key.toLowerCase() === "o") range(start, playhead);
      else if (e.key === "Enter") void trim();
      else if (e.key === "Escape") cancel();
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [phase, pick, playhead, step, start, end, trim]);
  return (
    <main className="relative flex h-full flex-col bg-background p-4 sm:p-6">
      {drag && (
        <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-background/90 text-xl font-semibold">
          Drop MP4 to open
        </div>
      )}
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="font-semibold">Video Trimmer</h1>
          {video && (
            <p className="max-w-[55vw] truncate text-xs text-muted-foreground">
              {video.path}
            </p>
          )}
        </div>
        <AccelerationBadge records={acceleration} />
      </header>
      {!video &&
      (phase === "empty" || phase === "error" || phase === "loading") ? (
        <section className="grid flex-1 place-items-center">
          <button
            onClick={() => void pick()}
            disabled={phase === "loading"}
            className="flex min-h-64 w-full max-w-2xl flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed bg-card p-8 text-center hover:border-primary"
          >
            <Upload size={42} />
            <span className="text-xl font-medium">
              {phase === "loading" ? "Inspecting video…" : "Open an MP4 video"}
            </span>
            <span className="text-sm text-muted-foreground">
              Click, press Enter, use Ctrl+O, or drop one file
            </span>
          </button>
        </section>
      ) : (
        video && (
          <section className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">
              <video
                key={video.previewUrl}
                ref={player}
                src={video.previewUrl}
                controls
                className="max-h-full max-w-full"
                onLoadedMetadata={() => setPreviewOk(true)}
                onError={() => {
                  boundedStop.current = null;
                  boundedSeekTarget.current = null;
                  boundedVersion.current += 1;
                  setPreviewOk(false);
                  setError(
                    "This MP4 was inspected successfully, but WebKit/GStreamer cannot preview it.",
                  );
                }}
                onTimeUpdate={(e) => syncPlaybackTime(e.currentTarget)}
                onEnded={(e) => stopBoundedPlayback(e.currentTarget)}
                onSeeking={(e) => {
                  const current = secondsToMicros(e.currentTarget.currentTime);
                  const target = boundedSeekTarget.current;
                  if (target === null || Math.abs(current - target) > step) {
                    boundedStop.current = null;
                    boundedSeekTarget.current = null;
                    boundedVersion.current += 1;
                  }
                }}
                onSeeked={() => {
                  boundedSeekTarget.current = null;
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => {
                  setPlaying(false);
                  boundedStop.current = null;
                  boundedSeekTarget.current = null;
                  boundedVersion.current += 1;
                }}
              />
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={playing ? "Pause" : "Play"}
                    onClick={toggle}
                  >
                    {playing ? <Pause /> : <Play />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={phase !== "ready" || !previewOk}
                    onClick={() =>
                      playInterval(start, Math.min(start + 2_000_000, end))
                    }
                  >
                    Preview start
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={phase !== "ready" || !previewOk}
                    onClick={() => playInterval(start, end)}
                  >
                    Play selection
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={phase !== "ready" || !previewOk}
                    onClick={() =>
                      playInterval(Math.max(start, end - 2_000_000), end)
                    }
                  >
                    Preview end
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">
                  {video.width}×{video.height} · {video.codec} ·{" "}
                  {video.frameRate.toFixed(3)} fps
                  {video.hasAudio ? " · audio" : " · silent"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void pick()}
                  disabled={phase === "exporting"}
                >
                  <FolderOpen size={15} /> Replace
                </Button>
              </div>
              <Timeline
                duration={video.durationMicros}
                start={start}
                end={end}
                playhead={playhead}
                step={step}
                thumbnails={video.thumbnails}
                onSeek={seek}
                onRange={range}
              />
              {video.thumbnailWarning && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {video.thumbnailWarning}
                </p>
              )}
              {phase === "exporting" && (
                <div className="mt-4">
                  <Progress value={(progress?.fraction ?? 0) * 100} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {progress?.attempt} ·{" "}
                    {Math.round((progress?.fraction ?? 0) * 100)}%
                  </p>
                </div>
              )}
            </div>
          </section>
        )
      )}
      <footer className="mt-4 flex items-center justify-between">
        <p
          role="status"
          aria-live="polite"
          className={`text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {error || notice}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button
            onClick={() => void trim()}
            disabled={!video || !previewOk || phase === "exporting"}
          >
            <Scissors size={16} /> Trim
          </Button>
        </div>
      </footer>
      <ConfirmCancel
        open={confirm}
        onOpenChange={setConfirm}
        onConfirm={() => {
          cancelRequested.current = true;
          void backend.cancelExport();
        }}
      />
    </main>
  );
}
