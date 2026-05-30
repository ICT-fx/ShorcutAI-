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
  const remaining = 1 - progress;

  let style: React.CSSProperties = {};
  switch (transitionIn.type) {
    case "fade":
      style = { opacity: progress };
      break;
    case "slide": // in from the right
      style = { transform: `translateX(${remaining * 100}%)` };
      break;
    case "slideUp": // in from the bottom
      style = { transform: `translateY(${remaining * 100}%)` };
      break;
    case "zoom": // punch-in scale + fade
      style = { transform: `scale(${0.82 + 0.18 * progress})`, opacity: progress };
      break;
    case "wipe": // left-to-right reveal
      style = { clipPath: `inset(0 ${remaining * 100}% 0 0)` };
      break;
    default:
      style = {};
  }

  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};
