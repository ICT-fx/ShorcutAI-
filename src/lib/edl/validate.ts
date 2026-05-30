/**
 * Cross-checks a (already Zod-parsed) EDL against the REAL media. This is the
 * guardrail described in the brief: the LLM can hallucinate ids or out-of-range
 * timestamps, so nothing reaches Remotion until it references media that exists
 * and stays within real bounds.
 *
 * Returns structured errors so the LLM repair loop can feed them straight back.
 */
import type { EDL } from "./schema";
import type { MediaInfo } from "@/lib/types";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// Tolerate tiny rounding past the end of a source (e.g. 12.0009 vs 12.000).
const OUT_OF_BOUNDS_TOLERANCE_SEC = 0.05;

export function validateEDL(edl: EDL, media: MediaInfo[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const byId = new Map(media.map((m) => [m.id, m]));
  const videos = new Set(media.filter((m) => m.kind === "video").map((m) => m.id));
  const images = new Set(media.filter((m) => m.kind === "image").map((m) => m.id));
  const audios = new Set(media.filter((m) => m.kind === "audio").map((m) => m.id));

  // --- Clips ---
  if (edl.tracks.clips.length === 0) {
    errors.push("EDL has no clips. At least one clip is required.");
  }
  const clipIds = new Set<string>();
  for (const clip of edl.tracks.clips) {
    if (clipIds.has(clip.id)) errors.push(`Duplicate clip id "${clip.id}".`);
    clipIds.add(clip.id);

    if (!videos.has(clip.sourceId)) {
      errors.push(
        `Clip "${clip.id}" references sourceId "${clip.sourceId}" which is not an available video.`,
      );
      continue;
    }
    if (clip.outPoint <= clip.inPoint) {
      errors.push(
        `Clip "${clip.id}" has outPoint (${clip.outPoint}) <= inPoint (${clip.inPoint}).`,
      );
    }
    const src = byId.get(clip.sourceId);
    const dur = src?.durationSec ?? null;
    if (dur != null && clip.outPoint > dur + OUT_OF_BOUNDS_TOLERANCE_SEC) {
      errors.push(
        `Clip "${clip.id}" outPoint (${clip.outPoint}s) exceeds source "${clip.sourceId}" duration (${dur.toFixed(2)}s).`,
      );
    }
  }

  // --- Overlays ---
  for (const ov of edl.tracks.overlays) {
    if (ov.endFrame <= ov.startFrame) {
      errors.push(`Overlay "${ov.id}" has endFrame <= startFrame.`);
    }
    if (ov.endFrame > edl.meta.durationInFrames) {
      warnings.push(
        `Overlay "${ov.id}" ends after the timeline (${ov.endFrame} > ${edl.meta.durationInFrames}); it will be clamped.`,
      );
    }
    if (ov.kind === "image" && !images.has(ov.content)) {
      errors.push(
        `Image overlay "${ov.id}" references image "${ov.content}" which does not exist.`,
      );
    }
  }

  // --- Captions ---
  for (const [i, cap] of edl.tracks.captions.entries()) {
    if (cap.endFrame <= cap.startFrame) {
      errors.push(`Caption #${i} has endFrame <= startFrame.`);
    }
  }

  // --- Audio / music ---
  if (edl.audio?.musicTrackId && !audios.has(edl.audio.musicTrackId)) {
    errors.push(
      `Music track "${edl.audio.musicTrackId}" is not an available audio asset.`,
    );
  }

  // --- Transitions ---
  for (const tr of edl.transitions) {
    if (!clipIds.has(tr.afterClipId)) {
      errors.push(
        `Transition references afterClipId "${tr.afterClipId}" which is not a clip in this EDL.`,
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
