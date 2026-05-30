import React from "react";
import { Audio } from "remotion";
import type { AudioConfig, Caption } from "../../lib/edl/schema";
import type { MediaInfo } from "../../lib/types";

/**
 * Background music. "Ducking" is approximated cheaply: when a caption is active
 * (a good proxy for voice), the music volume drops. True sidechain ducking from
 * audio analysis is a documented Phase-4+ upgrade.
 */
export const MusicTrack: React.FC<{
  audio: AudioConfig;
  media?: MediaInfo;
  captions: Caption[];
}> = ({ audio, media, captions }) => {
  if (!media) return null;
  const base = audio.musicVolume ?? 0.18;
  const ducked = base * 0.35;

  const isVoiceAt = (frame: number) =>
    captions.some((c) => frame >= c.startFrame && frame < c.endFrame);

  return (
    <Audio
      src={media.url}
      volume={(f) => (audio.duckUnderVoice && isVoiceAt(f) ? ducked : base)}
    />
  );
};
