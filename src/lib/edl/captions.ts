/**
 * Caption building, shared by the deterministic editor AND the LLM path.
 * Captions are ALWAYS derived from the real transcript timings (or the script
 * as a fallback) — never hallucinated — and mapped onto the concatenated
 * timeline defined by the ordered clips.
 */
import type { Caption } from "./schema";
import type { TranscriptResult, TranscriptWord } from "@/lib/types";

export interface TimelineClip {
  sourceId: string;
  inPoint: number;
  outPoint: number;
}

const toFrame = (sec: number, fps: number) => Math.max(0, Math.round(sec * fps));

function chunkWords(words: TranscriptWord[], wordsPerChunk: number): TranscriptWord[][] {
  const chunks: TranscriptWord[][] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk));
  }
  return chunks;
}

/**
 * Map per-source transcript segments/words onto the final timeline formed by
 * concatenating `clips` in order. Each clip occupies [startSec, startSec+len].
 */
export function buildCaptionsFromTranscripts(
  clips: TimelineClip[],
  fps: number,
  transcripts: Record<string, TranscriptResult>,
  style: "word" | "phrase",
): Caption[] {
  const captions: Caption[] = [];
  let startSec = 0;

  for (const clip of clips) {
    const len = Math.max(0, clip.outPoint - clip.inPoint);
    const tr = transcripts[clip.sourceId];
    if (tr) {
      if (style === "word") {
        const within = tr.words.filter((w) => w.start >= clip.inPoint && w.start < clip.outPoint);
        for (const group of chunkWords(within, 1)) {
          const s = group[0].start;
          const e = group[group.length - 1].end;
          captions.push({
            text: group.map((g) => g.word).join(" ").trim(),
            startFrame: toFrame(startSec + (s - clip.inPoint), fps),
            endFrame: toFrame(startSec + (e - clip.inPoint), fps),
          });
        }
      } else {
        for (const seg of tr.segments) {
          if (seg.end <= clip.inPoint || seg.start >= clip.outPoint) continue;
          const s = Math.max(seg.start, clip.inPoint);
          const e = Math.min(seg.end, clip.outPoint);
          captions.push({
            text: seg.text.trim(),
            startFrame: toFrame(startSec + (s - clip.inPoint), fps),
            endFrame: toFrame(startSec + (e - clip.inPoint), fps),
          });
        }
      }
    }
    startSec += len;
  }

  return captions;
}

/** Fallback when no transcript exists yet: distribute the script evenly. */
export function buildCaptionsFromScript(
  script: string,
  totalSec: number,
  fps: number,
): Caption[] {
  const sentences = script
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0 || totalSec <= 0) return [];

  const per = totalSec / sentences.length;
  return sentences.map((text, i) => ({
    text,
    startFrame: toFrame(i * per, fps),
    endFrame: toFrame((i + 1) * per - 0.05, fps),
  }));
}
