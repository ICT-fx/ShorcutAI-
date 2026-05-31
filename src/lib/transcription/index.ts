/**
 * Transcription router: tries providers in the configured order, first reachable
 * wins. Default order is "faster-whisper,groq" — free self-host first, paid
 * Groq only as a fallback.
 */
import path from "node:path";
import { config } from "@/lib/config";
import { extractAudioForTranscription, isFfmpegAvailable } from "@/lib/media/transcode";
import type { TranscriptResult } from "@/lib/types";
import { isGroqEnabled, transcribeWithGroq } from "./groq";
import { isWhisperServiceAvailable, transcribeWithWhisper } from "./whisper";

export async function transcribeBytes(
  bytes: Buffer,
  filename: string,
): Promise<TranscriptResult> {
  const errors: string[] = [];

  // Strip to a tiny 16kHz mono MP3 first. Sending a raw 1080p video to a
  // provider routinely blows past upload limits (the usual silent failure);
  // the audio is all transcription needs anyway. No-op if ffmpeg is missing.
  let audioBytes = bytes;
  let audioName = filename;
  if (await isFfmpegAvailable()) {
    try {
      audioBytes = await extractAudioForTranscription(bytes, path.extname(filename));
      audioName = `${filename.replace(/\.[^.]+$/, "")}.mp3`;
    } catch (err) {
      console.warn(
        `[transcribe] audio extraction failed, sending original bytes:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  for (const provider of config.transcription.providers) {
    try {
      if (provider === "faster-whisper") {
        if (!(await isWhisperServiceAvailable())) {
          errors.push("faster-whisper: service not reachable");
          continue;
        }
        return await transcribeWithWhisper(audioBytes, audioName);
      }
      if (provider === "groq") {
        if (!isGroqEnabled()) {
          errors.push("groq: GROQ_API_KEY not set");
          continue;
        }
        return await transcribeWithGroq(audioBytes, audioName);
      }
      errors.push(`unknown provider "${provider}"`);
    } catch (err) {
      errors.push(`${provider}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(
    `All transcription providers failed or unavailable:\n- ${errors.join("\n- ")}`,
  );
}

export { isWhisperServiceAvailable } from "./whisper";
export { isGroqEnabled } from "./groq";
