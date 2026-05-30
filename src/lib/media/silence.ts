/**
 * OPTIONAL silence detection via ffmpeg's `silencedetect` filter (Phase 4).
 * Used to trim dead air at clip edges when the user enables "remove silences".
 *
 * ffmpeg is NOT a hard dependency: if it isn't installed, every function here
 * degrades to a no-op and the editor keeps the full clip. Install with
 * `brew install ffmpeg` (macOS) to enable.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

let ffmpegAvailable: boolean | null = null;

export async function isFfmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await exec("ffmpeg", ["-version"]);
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

export interface SilenceInterval {
  start: number;
  end: number;
}

export async function detectSilences(
  filePath: string,
  opts: { noiseDb?: number; minSilenceSec?: number } = {},
): Promise<SilenceInterval[]> {
  if (!(await isFfmpegAvailable())) return [];
  const noise = opts.noiseDb ?? -30;
  const minDur = opts.minSilenceSec ?? 0.5;

  // ffmpeg prints silencedetect events to stderr; -f null discards the output.
  let stderr = "";
  try {
    const res = await exec("ffmpeg", [
      "-hide_banner",
      "-i",
      filePath,
      "-af",
      `silencedetect=noise=${noise}dB:d=${minDur}`,
      "-f",
      "null",
      "-",
    ]);
    stderr = res.stderr;
  } catch (err: any) {
    // ffmpeg exits non-zero in some setups but still prints to stderr.
    stderr = err?.stderr ?? "";
  }

  const intervals: SilenceInterval[] = [];
  let pendingStart: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    const e = /silence_end:\s*(-?[\d.]+)/.exec(line);
    if (s) pendingStart = parseFloat(s[1]);
    if (e && pendingStart !== null) {
      intervals.push({ start: pendingStart, end: parseFloat(e[1]) });
      pendingStart = null;
    }
  }
  // A trailing silence with no end means silence runs to EOF.
  if (pendingStart !== null) intervals.push({ start: pendingStart, end: Number.POSITIVE_INFINITY });
  return intervals;
}

/**
 * Returns [start, end] trimmed to the first/last non-silent moment. Falls back
 * to [0, duration] when ffmpeg is unavailable or the whole clip is silent.
 */
export async function nonSilentBounds(
  filePath: string,
  durationSec: number,
): Promise<{ start: number; end: number }> {
  const full = { start: 0, end: durationSec };
  const silences = await detectSilences(filePath);
  if (silences.length === 0) return full;

  let start = 0;
  let end = durationSec;
  const first = silences[0];
  if (first.start <= 0.15) start = Math.min(first.end, durationSec);
  const last = silences[silences.length - 1];
  if (last.end >= durationSec - 0.15 || last.end === Number.POSITIVE_INFINITY) {
    end = Math.max(start, last.start);
  }
  // Guard against pathological results (all silence) → keep full clip.
  if (end - start < 0.3) return full;
  return { start, end };
}
