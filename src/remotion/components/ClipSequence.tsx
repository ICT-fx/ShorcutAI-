/**
 * Renders a single source rush trimmed to [inPoint, outPoint], covering the
 * canvas. Uses OffthreadVideo (Remotion's render-accurate video tag).
 */
import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, useCurrentFrame } from "remotion";
import type { CompiledClip } from "../../lib/edl/compile";
import type { MediaInfo } from "../../lib/types";

// Subtle push-in/out amplitude — enough to feel alive, not seasick.
const ZOOM_FROM = 1;
const ZOOM_TO = 1.08;

export const ClipSequence: React.FC<{
  clip: CompiledClip;
  media: MediaInfo;
  fps: number;
}> = ({ clip, media, fps }) => {
  const frame = useCurrentFrame(); // relative to this clip's Sequence
  const trimBefore = Math.round(clip.inPoint * fps);
  const trimAfter = Math.round(clip.outPoint * fps);

  // Slow Ken-Burns scale across the whole clip when an effect is requested.
  let scale = 1;
  const dur = Math.max(1, clip.durationInFrames);
  if (clip.effect === "zoomIn") {
    scale = interpolate(frame, [0, dur], [ZOOM_FROM, ZOOM_TO], { extrapolateRight: "clamp" });
  } else if (clip.effect === "zoomOut") {
    scale = interpolate(frame, [0, dur], [ZOOM_TO, ZOOM_FROM], { extrapolateRight: "clamp" });
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "black", overflow: "hidden" }}>
      <OffthreadVideo
        src={media.url}
        trimBefore={trimBefore}
        trimAfter={trimAfter}
        volume={clip.volume ?? 1}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      />
    </AbsoluteFill>
  );
};
