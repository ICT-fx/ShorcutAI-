/**
 * Groq Whisper fallback (~$0.04 / audio-hour). Only used when enabled via
 * GROQ_API_KEY and the self-hosted service is unavailable. Returns word- and
 * segment-level timestamps.
 */
import Groq, { toFile } from "groq-sdk";
import { config } from "@/lib/config";
import type { TranscriptResult, TranscriptSegment, TranscriptWord } from "@/lib/types";

export function isGroqEnabled(): boolean {
  return Boolean(config.transcription.groqApiKey);
}

export async function transcribeWithGroq(
  bytes: Buffer,
  filename: string,
): Promise<TranscriptResult> {
  if (!isGroqEnabled()) throw new Error("Groq is not configured (GROQ_API_KEY missing).");

  const client = new Groq({ apiKey: config.transcription.groqApiKey });
  const file = await toFile(bytes, filename);

  const res: any = await client.audio.transcriptions.create({
    file,
    model: config.transcription.groqModel,
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
  });

  const segments: TranscriptSegment[] = (res.segments ?? []).map((s: any, i: number) => ({
    id: s.id ?? i,
    text: s.text ?? "",
    start: s.start ?? 0,
    end: s.end ?? 0,
  }));
  const words: TranscriptWord[] = (res.words ?? []).map((w: any) => ({
    word: w.word ?? "",
    start: w.start ?? 0,
    end: w.end ?? 0,
  }));

  return {
    provider: "groq",
    language: res.language,
    durationSec: res.duration,
    segments,
    words,
  };
}
