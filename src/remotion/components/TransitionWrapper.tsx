/**
 * Applies a simple ENTER animation to a clip based on the transition declared
 * after the previous clip. Clips never overlap, so the timeline math in
 * compile.ts stays exact. (Cross-dissolve via @remotion/transitions is a
 * documented Phase-4 upgrade.)
 */
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { CompiledClip } from "../../lib/edl/compile";

export const TransitionWrapper: React.FC<{
  transitionIn?: CompiledClip["transitionIn"];
  children: React.ReactNode;
}> = ({ transitionIn, children }) => {
  const frame = useCurrentFrame(); // relative to this clip's Sequence

  if (!transitionIn || transitionIn.durationInFrames <= 0) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  const d = transitionIn.durationInFrames;
  const progress = interpolate(frame, [0, d], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  let style: React.CSSProperties = {};
  if (transitionIn.type === "fade") {
    style = { opacity: progress };
  } else if (transitionIn.type === "slide") {
    style = { transform: `translateX(${(1 - progress) * 100}%)` };
  }

  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};
