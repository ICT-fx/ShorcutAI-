/**
 * Optional H.264 normalisation via ffmpeg. iPhones record in HEVC (H.265) by
 * default, which Remotion's headless Chrome can't decode → black/failed render.
 * On upload we detect the codec and transcode anything Chrome can't play to a
 * safe H.264 MP4. If ffmpeg/ffprobe aren't installed, this no-ops (the original
 * file is kept) — the app still works for already-compatible files.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

// Codecs Remotion's render Chrome can decode. Everything else gets transcoded.
const CHROME_OK = new Set(["h264", "avc1", "vp8", "vp9", "av1", "theora"]);

let ffmpegOk: boolean | null = null;
export async function isFfmpegAvailable(): Promise<boolean> {
  if (ffmpegOk !== null) return ffmpegOk;
  try {
    await exec("ffmpeg", ["-version"]);
    await exec("ffprobe", ["-version"]);
    ffmpegOk = true;
  } catch {
    ffmpegOk = false;
  }
  return ffmpegOk;
}

/** Returns the first video stream's codec name (e.g. "hevc", "h264"), or null. */
export async function probeVideoCodec(filePath: string): Promise<string | null> {
  try {
    const { stdout } = await exec("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name",
      "-of", "default=nw=1:nk=1",
      filePath,
    ]);
    return stdout.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

export function isChromeCompatibleCodec(codec: string | null): boolean {
  // Unknown codec → assume OK (don't transcode blindly).
  if (!codec) return true;
  return CHROME_OK.has(codec);
}

/**
 * Extract a tiny, transcription-friendly audio track from any audio/video bytes:
 * mono, 16 kHz, MP3. Whisper-class models only need 16 kHz mono, and this shrinks
 * a 1080p clip from tens of MB to well under provider file-size limits (Groq caps
 * uploads), which is the usual reason transcription silently fails. Requires
 * ffmpeg; callers should guard with isFfmpegAvailable() and fall back to the raw
 * bytes on error.
 */
export async function extractAudioForTranscription(input: Buffer, inExt: string): Promise<Buffer> {
  const ext = inExt.startsWith(".") ? inExt : `.${inExt || "mp4"}`;
  const dir = await mkdtemp(path.join(tmpdir(), "audio-"));
  try {
    const inPath = path.join(dir, `in${ext}`);
    const outPath = path.join(dir, "out.mp3");
    await writeFile(inPath, input);
    await exec(
      "ffmpeg",
      ["-y", "-i", inPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", outPath],
      { maxBuffer: 1024 * 1024 * 64 },
    );
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Transcode any input to a broadly-compatible H.264 + AAC MP4. */
export async function transcodeToH264(inputPath: string, outputPath: string): Promise<void> {
  await exec(
    "ffmpeg",
    [
      "-y",
      "-i", inputPath,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p", // max compatibility (some HEVC is 10-bit/yuv422)
      "-c:a", "aac",
      "-b:a", "160k",
      "-movflags", "+faststart",
      outputPath,
    ],
    { maxBuffer: 1024 * 1024 * 64 }, // ffmpeg logs to stderr; give it room
  );
}
