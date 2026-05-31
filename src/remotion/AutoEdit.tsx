/**
 * The single parametrized composition. It renders ANY valid compiled EDL —
 * there is zero hard-coded editing logic here. The exact same props object is
 * used by the browser <Player> (preview) and renderMedia() (final render).
 */
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { AutoEditProps } from "../lib/edl/compile";
import { OVERLAY_TEMPLATES, type OverlayTemplateKey } from "../lib/edl/overlayTemplates";
import { getToolComponent } from "../lib/edl/tools/components";
import { Captions } from "./components/Captions";
import { ClipSequence } from "./components/ClipSequence";
import { ImageOverlay } from "./components/ImageOverlay";
import { MusicTrack } from "./components/MusicTrack";
import { TextOverlay } from "./components/TextOverlay";
import { TransitionWrapper } from "./components/TransitionWrapper";

export const AutoEdit: React.FC<AutoEditProps> = ({
  meta,
  clips,
  overlays,
  captions,
  elements,
  audio,
  style,
  media,
}) => {
  const overlayTemplate =
    OVERLAY_TEMPLATES[style?.overlayTemplate as OverlayTemplateKey] ?? OVERLAY_TEMPLATES.punch;
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* --- Video clip track --- */}
      {clips.map((clip) => {
        const src = media[clip.sourceId];
        if (!src) return null;
        return (
          <Sequence
            key={clip.id}
            from={clip.fromFrame}
            durationInFrames={clip.durationInFrames}
            name={`clip:${clip.id}`}
          >
            <TransitionWrapper transitionIn={clip.transitionIn}>
              <ClipSequence clip={clip} media={src} fps={meta.fps} />
            </TransitionWrapper>
          </Sequence>
        );
      })}

      {/* --- Overlays (text + image) --- */}
      {overlays.map((ov) => {
        const duration = Math.max(1, ov.endFrame - ov.startFrame);
        return (
          <Sequence
            key={ov.id}
            from={ov.startFrame}
            durationInFrames={duration}
            name={`overlay:${ov.id}`}
          >
            {ov.kind === "text" ? (
              <TextOverlay overlay={ov} template={ov.id === "title" ? undefined : overlayTemplate} />
            ) : (
              <ImageOverlay overlay={ov} media={media[ov.content]} />
            )}
          </Sequence>
        );
      })}

      {/* --- Motion-graphics elements (registered tools) --- */}
      {elements?.map((el) => {
        const Tool = getToolComponent(el.type);
        if (!Tool) return null; // unknown type — validation rejects these, render-safe.
        const duration = Math.max(1, el.endFrame - el.startFrame);
        return (
          <Sequence key={el.id} from={el.startFrame} durationInFrames={duration} name={`element:${el.type}:${el.id}`}>
            <Tool params={el.params as any} durationInFrames={duration} media={media} />
          </Sequence>
        );
      })}

      {/* --- Captions --- */}
      <Captions captions={captions} fontKey={style?.captionFont} />

      {/* --- Background music (top-level so ducking sees absolute frames) --- */}
      {audio?.musicTrackId ? (
        <MusicTrack audio={audio} media={media[audio.musicTrackId]} captions={captions} />
      ) : null}
    </AbsoluteFill>
  );
};
