/**
 * Compiles a validated EDL into the exact props object consumed by the
 * <AutoEdit> Remotion composition. The SAME compiled props feed both the
 * browser <Player> (preview) and the server renderMedia() (final render) —
 * guaranteeing "what you preview is what you render".
 *
 * Browser-safe: no node-only imports here.
 */
import type { AudioConfig, Caption, Clip, EDL, Meta, Overlay, Transition } from "./schema";
import type { MediaInfo } from "@/lib/types";

export interface CompiledClip extends Clip {
  /** Absolute start frame on the final timeline. */
  fromFrame: number;
  /** Length of this clip on the timeline, in frames. */
  durationInFrames: number;
  /** Transition applied as this clip ENTERS (derived from the prev clip's transition). */
  transitionIn?: { type: Transition["type"]; durationInFrames: number };
}

// A `type` (not `interface`) so it carries an implicit index signature and
// satisfies Remotion's `Record<string, unknown>` props constraint.
export type AutoEditProps = {
  meta: Meta;
  clips: CompiledClip[];
  overlays: Overlay[];
  captions: Caption[];
  audio?: AudioConfig;
  /** id -> media descriptor (with a fetchable url). */
  media: Record<string, MediaInfo>;
};

const framesFor = (seconds: number, fps: number) => Math.max(1, Math.round(seconds * fps));

/**
 * Clips are placed back-to-back (no overlap), so timeline math is trivial and
 * always correct. A transition declared `afterClipId: X` becomes the ENTER
 * animation of the clip following X. (True cross-dissolve via @remotion/
 * transitions is a documented Phase-4 upgrade — see RAPPORT/TODO.)
 */
export function compileEDL(edl: EDL, media: MediaInfo[]): AutoEditProps {
  const fps = edl.meta.fps;
  const mediaMap: Record<string, MediaInfo> = {};
  for (const m of media) mediaMap[m.id] = m;

  // Transition declared after a given clip id.
  const transitionAfter = new Map<string, Transition>();
  for (const t of edl.transitions) transitionAfter.set(t.afterClipId, t);

  const clips: CompiledClip[] = [];
  let cursor = 0;
  edl.tracks.clips.forEach((clip, index) => {
    const durationInFrames = framesFor(clip.outPoint - clip.inPoint, fps);
    const prev = index > 0 ? edl.tracks.clips[index - 1] : undefined;
    const incoming = prev ? transitionAfter.get(prev.id) : undefined;
    clips.push({
      ...clip,
      fromFrame: cursor,
      durationInFrames,
      transitionIn:
        incoming && incoming.type !== "cut"
          ? { type: incoming.type, durationInFrames: incoming.durationInFrames }
          : undefined,
    });
    cursor += durationInFrames;
  });

  const clipsEnd = cursor;
  const overlaysEnd = edl.tracks.overlays.reduce((m, o) => Math.max(m, o.endFrame), 0);
  const captionsEnd = edl.tracks.captions.reduce((m, c) => Math.max(m, c.endFrame), 0);

  // The timeline must cover everything; clamp to at least 1 frame.
  const durationInFrames = Math.max(1, clipsEnd, overlaysEnd, captionsEnd);

  return {
    meta: { ...edl.meta, durationInFrames },
    clips,
    overlays: edl.tracks.overlays,
    captions: edl.tracks.captions,
    audio: edl.audio,
    media: mediaMap,
  };
}
