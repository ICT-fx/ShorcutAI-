/**
 * Transcription router: tries providers in the configured order, first reachable
 * wins. Default order is "faster-whisper,groq" — free self-host first, paid
 * Groq only as a fallback.
 */
import { config } from "@/lib/config";
import type { TranscriptResult } from "@/lib/types";
import { isGroqEnabled, transcribeWithGroq } from "./groq";
import { isWhisperServiceAvailable, transcribeWithWhisper } from "./whisper";

export async function transcribeBytes(
  bytes: Buffer,
  filename: string,
): Promise<TranscriptResult> {
  const errors: string[] = [];

  for (const provider of config.transcription.providers) {
    try {
      if (provider === "faster-whisper") {
        if (!(await isWhisperServiceAvailable())) {
          errors.push("faster-whisper: service not reachable");
          continue;
        }
        return await transcribeWithWhisper(bytes, filename);
      }
      if (provider === "groq") {
        if (!isGroqEnabled()) {
          errors.push("groq: GROQ_API_KEY not set");
          continue;
        }
        return await transcribeWithGroq(bytes, filename);
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
