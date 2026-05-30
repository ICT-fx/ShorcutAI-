/**
 * The deterministic editor: turns media + preferences (+ optional transcripts)
 * into a valid EDL using simple, predictable rules — NO LLM. This is both the
 * Phase-1 MVP and the always-available fallback when the AI layer is disabled
 * or fails. Per the brief: the app must produce a correct video without any AI.
 *
 * Rules:
 *  - Concatenate all video rushes in upload order (full length, capped).
 *  - Captions from the per-source transcript, mapped onto the concatenated
 *    timeline. If no transcript exists yet, evenly distribute the script text
 *    so the user still sees subtitles in the preview.
 *  - Optional intro title overlay + per-clip transitions + background music.
 */
import { FORMAT_DIMENSIONS, type EditPreferences } from "@/lib/types";
import type { MediaInfo, TranscriptResult } from "@/lib/types";
import { buildCaptionsFromScript, buildCaptionsFromTranscripts } from "./captions";
import { parseEDL, type Caption, type EDL, type Overlay, type Transition, type TransitionType } from "./schema";
import { TITLE_STYLES } from "./titleStyles";

/**
 * Pace-tuned variety pools used by the "auto" transition mode in the
 * deterministic editor (the LLM picks its own). Slow stays sober; fast gets
 * punchy and varied so the cut feels dynamic. Rotated across consecutive cuts.
 */
const AUTO_TRANSITION_POOLS: Record<EditPreferences["pace"], TransitionType[]> = {
  slow: ["fade"],
  medium: ["fade", "slide", "fade", "slideUp"],
  fast: ["zoom", "slide", "wipe", "slideUp"],
};

export interface DeterministicInput {
  media: MediaInfo[];
  preferences: EditPreferences;
  script: string;
  /** sourceId -> transcript (optional; present from Phase 2 onward). */
  transcripts?: Record<string, TranscriptResult>;
  /** Per-file cap, seconds (from config.limits.maxClipSeconds). 0 = no cap. */
  maxClipSeconds?: number;
  /** Optional non-silent [start,end] per sourceId (Phase 4 silence trimming). */
  trimBounds?: Record<string, { start: number; end: number }>;
}

const toFrame = (sec: number, fps: number) => Math.max(0, Math.round(sec * fps));

export function generateDeterministicEDL(input: DeterministicInput): EDL {
  const { preferences: prefs, media } = input;
  const fps = prefs.fps;
  const { width, height } = FORMAT_DIMENSIONS[prefs.format];
  const cap = input.maxClipSeconds ?? 0;

  const videos = media.filter((m) => m.kind === "video");
  if (videos.length === 0) {
    throw new Error("Deterministic editor: no video rushes available to assemble.");
  }

  // --- Clips: concatenate rushes in order (optionally edge-trimmed of silence) ---
  const clips = videos.map((v, i) => {
    const full = v.durationSec ?? 5; // images/unknown default; videos always probed
    const trim = input.trimBounds?.[v.id];
    const inPoint = trim ? Math.max(0, trim.start) : 0;
    const rawOut = trim ? Math.min(full, trim.end) : full;
    const outPoint = cap > 0 ? Math.min(rawOut, inPoint + cap) : rawOut;
    return {
      id: `clip-${i + 1}`,
      sourceId: v.id,
      inPoint,
      outPoint: Math.max(outPoint, inPoint + 0.1),
      volume: 1,
    };
  });

  // Total timeline length (clips are concatenated back-to-back).
  const totalSec = clips.reduce((acc, c) => acc + (c.outPoint - c.inPoint), 0);

  // --- Captions (shared with the LLM path; always from real timings) ---
  let captions: Caption[] = [];
  if (prefs.captions) {
    const haveTranscripts =
      input.transcripts && Object.keys(input.transcripts).length > 0;
    if (haveTranscripts) {
      captions = buildCaptionsFromTranscripts(
        clips,
        fps,
        input.transcripts!,
        prefs.captionStyle,
      );
    } else if (input.script.trim()) {
      captions = buildCaptionsFromScript(input.script, totalSec, fps);
    }
  }

  // --- Overlays: optional intro title ---
  const overlays: Overlay[] = [];
  if (prefs.title.trim()) {
    const preset = TITLE_STYLES[prefs.titleStyle];
    overlays.push({
      id: "title",
      kind: "text",
      content: prefs.title.trim(),
      startFrame: 0,
      endFrame: toFrame(Math.min(2.5, totalSec), fps),
      position: preset.position,
      animation: preset.animation,
      fontFamily: preset.fontKey,
      fontSizePx: Math.round(width * preset.sizeFraction),
      color: preset.color,
      backgroundColor: preset.backgroundColor,
    });
  }

  // --- Transitions ---
  // "auto" rotates a pace-tuned variety pool for a dynamic feel; a concrete
  // value forces that single transition; "cut" leaves the array empty.
  const transitions: Transition[] = [];
  if (prefs.transition !== "cut") {
    const pool = AUTO_TRANSITION_POOLS[prefs.pace];
    for (let i = 0; i < clips.length - 1; i++) {
      const type: TransitionType =
        prefs.transition === "auto" ? pool[i % pool.length] : prefs.transition;
      transitions.push({
        afterClipId: clips[i].id,
        type,
        durationInFrames: prefs.transitionDurationFrames,
      });
    }
  }

  const edl = {
    version: 1 as const,
    meta: {
      fps,
      width,
      height,
      durationInFrames: Math.max(1, toFrame(totalSec, fps)),
    },
    tracks: {
      clips,
      overlays,
      captions,
    },
    audio: prefs.musicTrackId
      ? { musicTrackId: prefs.musicTrackId, duckUnderVoice: prefs.duckMusic, musicVolume: 0.18 }
      : undefined,
    transitions,
    style: { captionFont: prefs.captionFont },
  };

  // Round-trip through the schema so defaults are applied and we fail loudly
  // here (in our own code) rather than downstream in Remotion.
  return parseEDL(edl);
}
