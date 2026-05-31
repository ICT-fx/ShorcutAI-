/**
 * Shared domain types that are NOT part of the EDL contract itself but feed
 * into it: media descriptors, transcripts, and user editing preferences.
 */
import { z } from "zod";

// --- Media -------------------------------------------------------------------

export type MediaKind = "video" | "image" | "audio";

/** Lightweight media descriptor passed to the editor + Remotion. */
export interface MediaInfo {
  id: string;
  kind: MediaKind;
  originalName: string;
  /** HTTP URL the browser <Player> and the render Chrome can both fetch. */
  url: string;
  mimeType: string;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  hasAudio?: boolean;
}

// --- Transcript --------------------------------------------------------------

export interface TranscriptWord {
  word: string;
  start: number; // seconds
  end: number; // seconds
}

export interface TranscriptSegment {
  id: number;
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface TranscriptResult {
  provider: string;
  language?: string;
  durationSec?: number;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
}

// --- Editing preferences (the user form) -------------------------------------

export const EditPreferencesSchema = z.object({
  /** Output aspect ratio. */
  format: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).default(30),
  /** Pacing influences clip length targets and trimming aggressiveness. */
  pace: z.enum(["slow", "medium", "fast"]).default("medium"),
  /** Burned-in captions from the transcript. */
  captions: z.boolean().default(true),
  captionStyle: z.enum(["word", "phrase"]).default("phrase"),
  /** Font used for burned-in captions (and the default for titles). */
  captionFont: z
    .enum(["montserrat", "poppins", "oswald", "bebasneue", "anton"])
    .default("montserrat"),
  /** Preset look for the intro title overlay (chosen via buttons in the UI). */
  titleStyle: z.enum(["bold", "boxed", "minimal", "kinetic"]).default("bold"),
  /** Visual template for the AI-added text encarts (callouts). */
  overlayTemplate: z.enum(["punch", "pastille", "contour", "neon"]).default("punch"),
  /** Drop detected silences at clip edges (Phase 4). */
  removeSilences: z.boolean().default(false),
  /**
   * Default transition between clips. "auto" hands the choice to the editor:
   * the LLM picks and VARIES transitions per cut to fit the context (more
   * dynamic or more sober), and the deterministic fallback rotates a tasteful
   * set based on the pace. Any other value forces that single transition.
   */
  transition: z
    .enum(["auto", "cut", "fade", "slide", "slideUp", "zoom", "wipe"])
    .default("auto"),
  transitionDurationFrames: z.number().int().min(0).max(60).default(8),
  /** Optional background music asset id + ducking. */
  musicTrackId: z.string().optional(),
  duckMusic: z.boolean().default(true),
  /** Free-text creative direction handed to the LLM editor (Phase 3). */
  styleNotes: z.string().default(""),
  /** Show the title as an intro overlay. */
  title: z.string().default(""),
});
export type EditPreferences = z.infer<typeof EditPreferencesSchema>;

export const FORMAT_DIMENSIONS: Record<
  EditPreferences["format"],
  { width: number; height: number }
> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
};
