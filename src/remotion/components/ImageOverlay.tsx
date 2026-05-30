import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Overlay } from "../../lib/edl/schema";
import type { MediaInfo } from "../../lib/types";
import { isCoordPosition, positionContainerStyle } from "./position";

/** Image overlay (logo, screenshot, fixed b-roll). `overlay.content` is a media id. */
export const ImageOverlay: React.FC<{ overlay: Overlay; media?: MediaInfo }> = ({
  overlay,
  media,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  if (!media) return null;

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 12 });
  const opacity = overlay.animation === "none" ? 1 : enter;
  const translateY =
    overlay.animation === "slideUp" ? (1 - enter) * 40 : overlay.animation === "slideDown" ? (1 - enter) * -40 : 0;
  const scale = overlay.animation === "scaleIn" ? interpolate(enter, [0, 1], [0.8, 1]) : 1;

  const imgWidth = (overlay.widthFraction ?? 0.4) * width;
  const coord = isCoordPosition(overlay.position) ? overlay.position : null;

  const img = (
    <Img
      src={media.url}
      style={{
        width: imgWidth,
        height: "auto",
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        filter: "drop-shadow(0 6px 24px rgba(0,0,0,0.35))",
      }}
    />
  );

  if (coord) {
    return (
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            left: `${coord.x * 100}%`,
            top: `${coord.y * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          {img}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ ...positionContainerStyle(overlay.position), display: "flex" }}>
      {img}
    </AbsoluteFill>
  );
};
