/**
 * Phase 0 smoke-test composition. Renders entirely from code (no media), so
 * `npm run remotion:render:test` proves the local render pipeline works before
 * any uploads exist.
 */
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const TestCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 200 } });
  const opacity = interpolate(
    frame,
    [0, 15, durationInFrames - 15, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const hue = interpolate(frame, [0, durationInFrames], [220, 320]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: `hsl(${hue}, 70%, 12%)`,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ transform: `scale(${scale})`, opacity, textAlign: "center" }}>
        <div style={{ fontSize: 90, fontWeight: 800, color: "white" }}>
          Auto Video Editor
        </div>
        <div style={{ fontSize: 36, color: `hsl(${hue}, 80%, 75%)`, marginTop: 16 }}>
          Remotion render OK · Phase 0
        </div>
      </div>
    </AbsoluteFill>
  );
};
