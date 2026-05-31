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

const PHRASE_MAX_WORDS = 7;
const PHRASE_PAUSE_GAP_SEC = 0.7;

function joinWords(words: TranscriptWord[]): string {
  return words
    .map((w) => w.word.trim())
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

/**
 * Map per-source transcript WORDS onto the final timeline formed by
 * concatenating `clips` in order (each clip occupies [startSec, startSec+len]).
 *
 * Words are the unit (not segments) because the editor may cut a single source
 * into many clips: a segment can span a cut boundary and would otherwise be
 * emitted once per overlapping clip (duplicated text + 1-frame fragments). Each
 * word is assigned to exactly ONE clip — the one containing its start time — so
 * every spoken word appears once. "phrase" style groups words into short lines
 * (≤7 words, breaking on long pauses and sentence enders); "word" emits one
 * caption per word.
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
    if (!tr) {
      startSec += len;
      continue;
    }

    // Assign each word to the clip containing its START → no cross-clip dupes.
    const within = (tr.words ?? []).filter(
      (w) => w.start >= clip.inPoint && w.start < clip.outPoint,
    );
    // Map a source-time second to the position on the concatenated timeline.
    const map = (sec: number) =>
      startSec + (Math.min(Math.max(sec, clip.inPoint), clip.outPoint) - clip.inPoint);

    if (within.length > 0) {
      const groups: TranscriptWord[][] =
        style === "word" ? chunkWords(within, 1) : groupIntoPhrases(within);
      for (const group of groups) {
        const sf = toFrame(map(group[0].start), fps);
        const ef = toFrame(map(group[group.length - 1].end), fps);
        captions.push({ text: joinWords(group), startFrame: sf, endFrame: Math.max(sf + 1, ef) });
      }
    } else if (style === "phrase") {
      // No word-level timings from the provider → fall back to segments,
      // clamped to this clip (still one entry per overlapping segment).
      for (const seg of tr.segments) {
        if (seg.end <= clip.inPoint || seg.start >= clip.outPoint) continue;
        const sf = toFrame(map(Math.max(seg.start, clip.inPoint)), fps);
        const ef = toFrame(map(Math.min(seg.end, clip.outPoint)), fps);
        captions.push({ text: seg.text.trim(), startFrame: sf, endFrame: Math.max(sf + 1, ef) });
      }
    }

    startSec += len;
  }

  return captions;
}

/** Group consecutive words into short caption lines for "phrase" style. */
function groupIntoPhrases(words: TranscriptWord[]): TranscriptWord[][] {
  const groups: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = words[i - 1];
    const gap = prev ? w.start - prev.end : 0;
    if (current.length >= PHRASE_MAX_WORDS || (prev && gap > PHRASE_PAUSE_GAP_SEC)) {
      if (current.length) groups.push(current);
      current = [];
    }
    current.push(w);
    if (/[.!?]$/.test(w.word.trim())) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

/**
 * Fallback when no transcript exists yet: break the script into readable,
 * caption-sized chunks (~max 9 words) and spread them across the timeline,
 * weighting each chunk's on-screen time by its length. This never dumps a wall
 * of text — a long run-on "sentence" becomes several short captions rather than
 * one giant block sitting on screen for 20+ seconds.
 */
const MAX_CAPTION_WORDS = 9;

export function buildCaptionsFromScript(
  script: string,
  totalSec: number,
  fps: number,
): Caption[] {
  const sentences = script
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += MAX_CAPTION_WORDS) {
      chunks.push(words.slice(i, i + MAX_CAPTION_WORDS).join(" "));
    }
  }
  if (chunks.length === 0 || totalSec <= 0) return [];

  const totalWords = chunks.reduce((a, c) => a + c.split(/\s+/).length, 0);
  const captions: Caption[] = [];
  let acc = 0;
  for (const text of chunks) {
    const startSec = (acc / totalWords) * totalSec;
    acc += text.split(/\s+/).length;
    const endSec = (acc / totalWords) * totalSec;
    const startFrame = toFrame(startSec, fps);
    captions.push({
      text,
      startFrame,
      endFrame: Math.max(startFrame + 1, toFrame(endSec - 0.03, fps)),
    });
  }
  return captions;
}
