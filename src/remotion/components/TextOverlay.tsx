import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Overlay } from "../../lib/edl/schema";
import type { OverlayTemplate } from "../../lib/edl/overlayTemplates";
import { fontFamilyFor } from "../fonts";
import { isCoordPosition, positionContainerStyle } from "./position";

/**
 * A text overlay. The intro title renders from its own fields (no template); AI
 * callouts render with the chosen `template` (TikTok-style look). Animation is
 * relative to the overlay's own Sequence.
 */
export const TextOverlay: React.FC<{ overlay: Overlay; template?: OverlayTemplate }> = ({
  overlay,
  template,
}) => {
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
  const fontSize = overlay.fontSizePx ?? Math.round(width * (template?.sizeFraction ?? 0.05));

  // Text outline (TikTok "contour"/"punch"). paintOrder keeps the fill on top.
  const strokeStyle = (template?.strokeColor
    ? {
        WebkitTextStroke: `${(template.strokeWidthPx * width) / 1080}px ${template.strokeColor}`,
        paintOrder: "stroke",
      }
    : {}) as unknown as React.CSSProperties;

  const hasBox = template ? template.background !== null : true;

  const box: React.CSSProperties = {
    maxWidth: "84%",
    textAlign: "center",
    fontFamily: fontFamilyFor(template?.fontKey ?? overlay.fontFamily),
    fontWeight: template?.fontWeight ?? 800,
    fontSize,
    lineHeight: 1.15,
    letterSpacing: template?.letterSpacing,
    textTransform: template?.uppercase ? "uppercase" : undefined,
    color: template ? template.color : overlay.color ?? "white",
    background: template ? template.background ?? "transparent" : overlay.backgroundColor ?? "rgba(0,0,0,0.45)",
    padding: hasBox ? "0.4em 0.7em" : "0.05em 0.1em",
    borderRadius: template?.borderRadius ?? 14,
    textShadow: template?.shadow ?? "0 2px 12px rgba(0,0,0,0.5)",
    ...strokeStyle,
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
