import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamilyFor } from "@/remotion/fonts";
import type { ToolComponent } from "../types";
import type { LocationLowerThirdParams } from "./manifest";

/**
 * Animated lower-third: slides + fades in, holds, fades out near the end of its
 * Sequence. Sits above the caption safe-zone (bottom ~18%). Frame-relative to
 * the element's own Sequence, so it works at any timeline position.
 */
export const LocationLowerThird: ToolComponent<LocationLowerThirdParams> = ({
  params,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 14 });
  // Fade out over the last ~12 frames.
  const exit = interpolate(
    frame,
    [Math.max(0, durationInFrames - 12), durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = Math.min(enter, exit);
  const translateY = (1 - enter) * 36;

  const fontSize = Math.round(width * 0.044);
  const subSize = Math.round(width * 0.028);

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: "18%" }}>
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          display: "flex",
          alignItems: "center",
          gap: "0.5em",
          maxWidth: "86%",
          padding: "0.5em 0.85em",
          borderRadius: 14,
          background: "rgba(8,10,16,0.72)",
          backdropFilter: "blur(4px)",
          boxShadow: "0 6px 28px rgba(0,0,0,0.45)",
          borderLeft: "4px solid #ffd54a",
          fontFamily: fontFamilyFor("montserrat"),
          color: "white",
        }}
      >
        {params.icon !== "none" && (
          <span style={{ fontSize: fontSize * 1.05, lineHeight: 1 }} aria-hidden>
            📍
          </span>
        )}
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ fontSize, fontWeight: 800, letterSpacing: "-0.01em" }}>{params.place}</span>
          {params.sublabel ? (
            <span style={{ fontSize: subSize, fontWeight: 600, opacity: 0.82 }}>{params.sublabel}</span>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};
