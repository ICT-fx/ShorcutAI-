/**
 * Rough cost estimation, logged per job. Rates are approximate and centralised
 * here so they're easy to audit/update. The goal is awareness, not billing
 * accuracy: every estimate is $0 on the fully self-hosted/free path.
 */
import { config } from "@/lib/config";

// --- Rate table (USD), update as provider pricing changes ---
const RATES = {
  // Groq Whisper, per audio-hour. faster-whisper (self-host) = $0.
  groqWhisperPerHour: 0.04,
  // Anthropic Haiku-class, per million tokens (rough).
  llmInputPerMTok: 1.0,
  llmOutputPerMTok: 5.0,
  // Remotion "for Automators" commercial license: $0.01 per render
  // (only applies once REMOTION_LICENSE_KEY is set / you go commercial).
  remotionPerRender: 0.01,
};

export interface TranscriptionCost {
  kind: "transcription";
  provider: string;
  audioSeconds: number;
  estimatedUsd: number;
}

export interface LlmCost {
  kind: "llm";
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}

export interface RenderCost {
  kind: "render";
  renders: number;
  durationSeconds: number;
  licensed: boolean;
  estimatedUsd: number;
}

export function estimateTranscriptionCost(
  provider: string,
  audioSeconds: number,
): TranscriptionCost {
  const usd =
    provider === "groq" ? (audioSeconds / 3600) * RATES.groqWhisperPerHour : 0;
  return {
    kind: "transcription",
    provider,
    audioSeconds: Math.round(audioSeconds),
    estimatedUsd: round(usd),
  };
}

export function estimateLlmCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): LlmCost {
  const usd =
    (inputTokens / 1_000_000) * RATES.llmInputPerMTok +
    (outputTokens / 1_000_000) * RATES.llmOutputPerMTok;
  return { kind: "llm", model, inputTokens, outputTokens, estimatedUsd: round(usd) };
}

export function estimateRenderCost(durationSeconds: number): RenderCost {
  const licensed = Boolean(config.remotion.licenseKey);
  const usd = licensed ? RATES.remotionPerRender : 0;
  return {
    kind: "render",
    renders: 1,
    durationSeconds: Math.round(durationSeconds),
    licensed,
    estimatedUsd: round(usd),
  };
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
