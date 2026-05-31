import React from "react";
import { Composition } from "remotion";
import { AutoEdit } from "./AutoEdit";
import { TestCard } from "./TestCard";
import type { AutoEditProps } from "../lib/edl/compile";

// Minimal valid props so the composition is browsable in Remotion Studio.
const defaultAutoEditProps: AutoEditProps = {
  meta: { fps: 30, width: 1080, height: 1920, durationInFrames: 90 },
  clips: [],
  overlays: [
    {
      id: "demo",
      kind: "text",
      content: "Provide props via Player / renderMedia",
      startFrame: 0,
      endFrame: 90,
      position: "center",
      animation: "fadeIn",
    },
  ],
  captions: [],
  style: { captionFont: "montserrat", overlayTemplate: "punch" },
  media: {},
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Phase 0 smoke test — renders with no external media. */}
      <Composition
        id="TestCard"
        component={TestCard}
        durationInFrames={90}
        fps={30}
        width={1280}
        height={720}
      />

      {/* The real, data-driven composition. Metadata is derived from the EDL. */}
      <Composition
        id="AutoEdit"
        component={AutoEdit}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultAutoEditProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.meta.durationInFrames,
          fps: props.meta.fps,
          width: props.meta.width,
          height: props.meta.height,
        })}
      />
    </>
  );
};
