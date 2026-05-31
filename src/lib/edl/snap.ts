/**
 * Snap LLM-chosen clip in/out points to natural speech boundaries so cuts never
 * land mid-word or mid-phrase. The model aims approximately; this nudges each
 * boundary (within a small tolerance) onto the nearest word onset (for inPoint)
 * or word offset (for outPoint), preferring boundaries that sit next to a pause
 * — i.e. the gaps between sentences, where a clean cut belongs.
 */
import type { TranscriptResult, TranscriptWord } from "@/lib/types";

interface Boundary {
  t: number;
  /** True if a pause (silence ≥ PAUSE_SEC) sits on the cut side of this word. */
  pause: boolean;
}

const PAUSE_SEC = 0.25;

function boundaries(words: TranscriptWord[]): { onsets: Boundary[]; offsets: Boundary[] } {
  const onsets: Boundary[] = [];
  const offsets: Boundary[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prevGap = i > 0 ? w.start - words[i - 1].end : Infinity;
    const nextGap = i < words.length - 1 ? words[i + 1].start - w.end : Infinity;
    onsets.push({ t: w.start, pause: prevGap >= PAUSE_SEC });
    offsets.push({ t: w.end, pause: nextGap >= PAUSE_SEC });
  }
  return { onsets, offsets };
}

function snap(p: number, candidates: Boundary[], tol: number): number {
  const within = candidates.filter((c) => Math.abs(c.t - p) <= tol);
  if (within.length === 0) return p;
  const pauseOnes = within.filter((c) => c.pause);
  const pool = pauseOnes.length ? pauseOnes : within;
  pool.sort((a, b) => Math.abs(a.t - p) - Math.abs(b.t - p));
  return pool[0].t;
}

export interface SnappableClip {
  sourceId: string;
  inPoint: number;
  outPoint: number;
  [k: string]: unknown;
}

/**
 * Returns clips with in/out points snapped to transcript boundaries. Clips whose
 * source has no word-level transcript are returned unchanged. If snapping would
 * invert a clip (outPoint <= inPoint), the original points are kept.
 */
export function snapClipsToTranscripts<T extends SnappableClip>(
  clips: T[],
  transcripts: Record<string, TranscriptResult>,
  tolSec = 0.35,
): T[] {
  return clips.map((c) => {
    const words = transcripts[c.sourceId]?.words;
    if (!words || words.length === 0) return c;
    const { onsets, offsets } = boundaries(words);
    const inPoint = snap(c.inPoint, onsets, tolSec);
    const outPoint = snap(c.outPoint, offsets, tolSec);
    if (outPoint <= inPoint) return c;
    return { ...c, inPoint, outPoint };
  });
}
