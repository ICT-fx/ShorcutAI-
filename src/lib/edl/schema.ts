/**
 * THE EDL CONTRACT.
 *
 * The Edit Decision List is the single source of truth exchanged between the
 * editorial brain (deterministic rules OR the LLM) and Remotion. The AI may
 * hallucinate; this schema + the cross-check against real media (validate.ts)
 * is the guardrail. NO editing logic lives in the Remotion components — they
 * only render whatever a valid EDL describes.
 *
 * Frame conventions:
 *  - All timeline positions are expressed in FRAMES (integers), at meta.fps.
 *  - Clip in/out points are in SECONDS within their source rush.
 *  - Absolute timeline placement of clips is computed by compile.ts, not stored
 *    in the EDL the editor produces (clips are a simple ordered sequence).
 */
import { z } from "zod";

export const EDL_VERSION = 1 as const;

// --- Primitives --------------------------------------------------------------

export const PositionSchema = z.union([
  z.enum(["top", "center", "bottom"]),
  z.object({
    // Normalized 0..1 coordinates of the element's center on the canvas.
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
]);
export type Position = z.infer<typeof PositionSchema>;

export const AnimationSchema = z.enum([
  "none",
  "fadeIn",
  "slideUp",
  "slideDown",
  "scaleIn",
]);
export type Animation = z.infer<typeof AnimationSchema>;

// --- Tracks ------------------------------------------------------------------

export const ClipSchema = z.object({
  id: z.string().min(1),
  /** References a MediaAsset.id of kind "video". */
  sourceId: z.string().min(1),
  /** Seconds into the source rush where this clip starts. */
  inPoint: z.number().min(0),
  /** Seconds into the source rush where this clip ends. Must be > inPoint. */
  outPoint: z.number().min(0),
  /** Optional per-clip volume (0..1). Defaults to 1. */
  volume: z.number().min(0).max(1).optional(),
});
export type Clip = z.infer<typeof ClipSchema>;

export const OverlaySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["text", "image"]),
  /** Literal text for kind="text", or a MediaAsset.id (image) for kind="image". */
  content: z.string().min(1),
  startFrame: z.number().int().min(0),
  endFrame: z.number().int().min(0),
  position: PositionSchema.default("bottom"),
  animation: AnimationSchema.default("fadeIn"),
  /** Optional styling hints, all optional so the renderer can use defaults. */
  fontSizePx: z.number().int().positive().optional(),
  /** Font key (montserrat | poppins | oswald | bebasneue | anton). */
  fontFamily: z.string().optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  /** For image overlays: width as a fraction of canvas width (0..1). */
  widthFraction: z.number().min(0).max(1).optional(),
});
export type Overlay = z.infer<typeof OverlaySchema>;

export const CaptionSchema = z.object({
  text: z.string(),
  startFrame: z.number().int().min(0),
  endFrame: z.number().int().min(0),
});
export type Caption = z.infer<typeof CaptionSchema>;

export const TransitionSchema = z.object({
  /** Applies after the clip with this id, between it and the next clip. */
  afterClipId: z.string().min(1),
  type: z.enum(["cut", "fade", "slide"]),
  durationInFrames: z.number().int().min(0),
});
export type Transition = z.infer<typeof TransitionSchema>;

export const AudioSchema = z.object({
  /** MediaAsset.id of kind "audio" for background music. */
  musicTrackId: z.string().optional(),
  /** Lower the music volume while voice/clip audio plays. */
  duckUnderVoice: z.boolean().default(true),
  /** Music volume 0..1 when not ducked. */
  musicVolume: z.number().min(0).max(1).default(0.18),
});
export type AudioConfig = z.infer<typeof AudioSchema>;

export const MetaSchema = z.object({
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationInFrames: z.number().int().positive(),
});
export type Meta = z.infer<typeof MetaSchema>;

/** Global styling for the render (caption font, etc.). */
export const StyleSchema = z.object({
  captionFont: z.string().default("montserrat"),
});
export type StyleConfig = z.infer<typeof StyleSchema>;

// --- The EDL -----------------------------------------------------------------

export const EDLSchema = z.object({
  version: z.literal(EDL_VERSION).default(EDL_VERSION),
  meta: MetaSchema,
  tracks: z.object({
    clips: z.array(ClipSchema),
    overlays: z.array(OverlaySchema).default([]),
    captions: z.array(CaptionSchema).default([]),
  }),
  audio: AudioSchema.optional(),
  transitions: z.array(TransitionSchema).default([]),
  style: StyleSchema.default({ captionFont: "montserrat" }),
});
export type EDL = z.infer<typeof EDLSchema>;

/**
 * Parse + apply defaults. Throws a ZodError with readable issues on failure.
 * Use safeParseEDL when you want to feed errors back to the LLM repair loop.
 */
export function parseEDL(input: unknown): EDL {
  return EDLSchema.parse(input);
}

export function safeParseEDL(input: unknown) {
  return EDLSchema.safeParse(input);
}
