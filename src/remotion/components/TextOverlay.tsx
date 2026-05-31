import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Overlay } from "../../lib/edl/schema";
import { fontFamilyFor } from "../fonts";
import { isCoordPosition, positionContainerStyle } from "./position";

/** A text overlay (title, lower-third, callout). Animation is relative to its own Sequence. */
export const TextOverlay: React.FC<{ overlay: Overlay }> = ({ overlay }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 12 });
  let animStyle: React.CSSProperties = {};
  switch (overlay.animation) {
    case "fadeIn":
      animStyle = { opacity: enter };
      break;
    case "slideUp":
      animStyle = { opacity: enter, transform: `translateY(${(1 - enter) * 40}px)` };
      break;
    case "slideDown":
      animStyle = { opacity: enter, transform: `translateY(${(1 - enter) * -40}px)` };
      break;
    case "scaleIn":
      animStyle = { opacity: enter, transform: `scale(${interpolate(enter, [0, 1], [0.8, 1])})` };
      break;
    default:
      animStyle = {};
  }

  const coord = isCoordPosition(overlay.position) ? overlay.position : null;
  const fontSize = overlay.fontSizePx ?? Math.round(width * 0.05);

  const box: React.CSSProperties = {
    maxWidth: "84%",
    textAlign: "center",
    fontFamily: fontFamilyFor(overlay.fontFamily),
    fontWeight: 800,
    fontSize,
    lineHeight: 1.15,
    color: overlay.color ?? "white",
    background: overlay.backgroundColor ?? "rgba(0,0,0,0.45)",
    padding: "0.4em 0.6em",
    borderRadius: 14,
    textShadow: "0 2px 12px rgba(0,0,0,0.5)",
    ...animStyle,
  };

  if (coord) {
    return (
      <AbsoluteFill>
        <div
          style={{
            // Spread box FIRST so the centering transform below isn't clobbered
            // by the animation transform that box carries (via ...animStyle).
            ...box,
            position: "absolute",
            left: `${coord.x * 100}%`,
            top: `${coord.y * 100}%`,
            transform: `translate(-50%, -50%) ${animStyle.transform ?? ""}`,
          }}
        >
          {overlay.content}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ ...positionContainerStyle(overlay.position), display: "flex" }}>
      <div style={box}>{overlay.content}</div>
    </AbsoluteFill>
  );
};
