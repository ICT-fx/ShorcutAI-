/**
 * Client for the self-hosted faster-whisper microservice (services/transcription).
 * This is the FREE default path. We upload the media bytes directly so the
 * service needs no network access back to the app.
 */
import { config } from "@/lib/config";
import type { TranscriptResult, TranscriptSegment, TranscriptWord } from "@/lib/types";

interface WhisperResponse {
  language?: string;
  duration?: number;
  segments: { id: number; text: string; start: number; end: number }[];
  words: { word: string; start: number; end: number }[];
}

export async function transcribeWithWhisper(
  bytes: Buffer,
  filename: string,
): Promise<TranscriptResult> {
  const base = config.transcription.whisperServiceUrl.replace(/\/$/, "");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]), filename);

  const res = await fetch(`${base}/transcribe`, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`faster-whisper service returned ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as WhisperResponse;

  const segments: TranscriptSegment[] = data.segments.map((s) => ({
    id: s.id,
    text: s.text,
    start: s.start,
    end: s.end,
  }));
  const words: TranscriptWord[] = data.words.map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }));

  return {
    provider: "faster-whisper",
    language: data.language,
    durationSec: data.duration,
    segments,
    words,
  };
}

/** Is the self-hosted service reachable right now? */
export async function isWhisperServiceAvailable(): Promise<boolean> {
  const base = config.transcription.whisperServiceUrl.replace(/\/$/, "");
  try {
    const ctrl = AbortSignal.timeout(1500);
    const res = await fetch(`${base}/health`, { signal: ctrl });
    return res.ok;
  } catch {
    return false;
  }
}
