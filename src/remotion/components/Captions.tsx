import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { Caption } from "../../lib/edl/schema";

/**
 * Burned-in captions. Each caption is its own Sequence so it only mounts during
 * its window. Styled for the punchy, high-contrast look common to short-form.
 */
export const Captions: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const { width } = useVideoConfig();
  const fontSize = Math.round(width * 0.052);

  return (
    <>
      {captions.map((cap, i) => {
        const duration = Math.max(1, cap.endFrame - cap.startFrame);
        return (
          <Sequence key={i} from={cap.startFrame} durationInFrames={duration} name={`caption-${i}`}>
            <AbsoluteFill
              style={{
                justifyContent: "flex-end",
                alignItems: "center",
                paddingBottom: "10%",
              }}
            >
              <div
                style={{
                  maxWidth: "86%",
                  textAlign: "center",
                  fontFamily: "Inter, system-ui, sans-serif",
                  fontWeight: 800,
                  fontSize,
                  lineHeight: 1.2,
                  color: "white",
                  background: "rgba(0,0,0,0.55)",
                  padding: "0.25em 0.55em",
                  borderRadius: 12,
                  textShadow: "0 2px 10px rgba(0,0,0,0.6)",
                }}
              >
                {cap.text}
              </div>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </>
  );
};
