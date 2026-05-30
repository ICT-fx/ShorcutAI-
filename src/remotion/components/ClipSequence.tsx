/**
 * Renders a single source rush trimmed to [inPoint, outPoint], covering the
 * canvas. Uses OffthreadVideo (Remotion's render-accurate video tag).
 */
import React from "react";
import { AbsoluteFill, OffthreadVideo } from "remotion";
import type { CompiledClip } from "../../lib/edl/compile";
import type { MediaInfo } from "../../lib/types";

export const ClipSequence: React.FC<{
  clip: CompiledClip;
  media: MediaInfo;
  fps: number;
}> = ({ clip, media, fps }) => {
  const trimBefore = Math.round(clip.inPoint * fps);
  const trimAfter = Math.round(clip.outPoint * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <OffthreadVideo
        src={media.url}
        trimBefore={trimBefore}
        trimAfter={trimAfter}
        volume={clip.volume ?? 1}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </AbsoluteFill>
  );
};
