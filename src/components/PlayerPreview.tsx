"use client";

import { Player } from "@remotion/player";
import { AutoEdit } from "@/remotion/AutoEdit";
import type { AutoEditProps } from "@/lib/edl/compile";

/**
 * Browser preview using the EXACT same composition + props as the server render
 * — what you see here is what renderMedia() produces. No render is triggered.
 */
export function PlayerPreview({
  props,
  fps,
  durationInFrames,
  width,
  height,
}: {
  props: AutoEditProps;
  fps: number;
  durationInFrames: number;
  width: number;
  height: number;
}) {
  return (
    <div className="player-wrap">
      <Player
        component={AutoEdit}
        inputProps={props}
        durationInFrames={Math.max(1, durationInFrames)}
        fps={fps}
        compositionWidth={width}
        compositionHeight={height}
        controls
        loop
        acknowledgeRemotionLicense
        style={{ width: "100%", aspectRatio: `${width} / ${height}`, maxHeight: 560 }}
      />
    </div>
  );
}
