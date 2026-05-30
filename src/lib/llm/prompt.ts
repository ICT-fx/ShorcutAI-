/**
 * Prompt construction for the LLM editor. The SYSTEM prompt is stable (schema +
 * rules) so it can be prompt-cached; the USER prompt carries the per-project
 * volatile content (media, transcript, script, preferences).
 *
 * The LLM returns an editorial SKELETON only — clips/overlays/transitions/audio.
 * It never emits captions or meta: captions are injected deterministically from
 * the real transcript timings, and meta is set from the user's format/fps.
 */
import type { EditPreferences, MediaInfo, TranscriptResult } from "@/lib/types";

export const SYSTEM_PROMPT = `You are a senior short-form video editor. You are given raw clips (rushes), still images, an optional music track, the transcript of each rush (with timings), the creator's script, and editing preferences. Your job: decide the EDIT — which parts of which rushes to keep, in what order, what on-screen text overlays to add, and which transitions to use.

You MUST respond with a SINGLE JSON object and NOTHING else (no prose, no markdown fences). The JSON has exactly these top-level keys:

{
  "clips": [
    { "id": "clip-1", "sourceId": "<id of a VIDEO asset>", "inPoint": <seconds>, "outPoint": <seconds>, "volume": <0..1 optional> }
  ],
  "overlays": [
    { "id": "ov-1", "kind": "text", "content": "<text to display>", "startFrame": <int>, "endFrame": <int>, "position": "top|center|bottom", "animation": "none|fadeIn|slideUp|slideDown|scaleIn" },
    { "id": "ov-2", "kind": "image", "content": "<id of an IMAGE asset>", "startFrame": <int>, "endFrame": <int>, "position": "top|center|bottom", "widthFraction": <0..1 optional> }
  ],
  "transitions": [
    { "afterClipId": "clip-1", "type": "cut|fade|slide", "durationInFrames": <int> }
  ],
  "audio": { "musicTrackId": "<id of an AUDIO asset, optional>", "duckUnderVoice": true, "musicVolume": 0.18 }
}

HARD RULES (a validator will reject violations and you will be asked to fix them):
- "sourceId" MUST be one of the provided VIDEO asset ids. Image overlays' "content" MUST be a provided IMAGE asset id. "musicTrackId" MUST be a provided AUDIO asset id.
- 0 <= inPoint < outPoint <= the source's duration (seconds). Never exceed the duration.
- At least one clip is required. Prefer trimming dead air / filler over keeping everything.
- All *Frame values are integers at the given fps. startFrame < endFrame.
- "transitions[].afterClipId" must reference a clip id you output.
- Do NOT output captions or meta — those are added automatically.
- Keep the total edit within the requested target duration when one is given.

EDITORIAL GUIDANCE:
- Follow the script's intent and the style notes. Order clips to tell the story the script describes.
- Use text overlays for hooks, key points, and calls to action at the right moments (convert seconds to frames with fps).
- Use transitions sparingly and purposefully; "cut" is the default.`;

function summariseTranscript(tr: TranscriptResult, maxChars: number): string {
  // Compact, timestamped segments so the model can choose trim points.
  let out = "";
  for (const seg of tr.segments) {
    const line = `[${seg.start.toFixed(1)}-${seg.end.toFixed(1)}] ${seg.text.trim()}\n`;
    if (out.length + line.length > maxChars) {
      out += "…(truncated)\n";
      break;
    }
    out += line;
  }
  return out || "(no speech detected)";
}

export interface LlmPromptInput {
  prefs: EditPreferences;
  media: MediaInfo[];
  transcripts: Record<string, TranscriptResult>;
  script: string;
  width: number;
  height: number;
}

export function buildUserPrompt(input: LlmPromptInput): string {
  const { prefs, media, transcripts, script, width, height } = input;
  const videos = media.filter((m) => m.kind === "video");
  const images = media.filter((m) => m.kind === "image");
  const audios = media.filter((m) => m.kind === "audio");

  const lines: string[] = [];
  lines.push(`OUTPUT FORMAT: ${prefs.format} (${width}x${height}), ${prefs.fps} fps.`);
  lines.push(`PACING: ${prefs.pace}. DEFAULT TRANSITION: ${prefs.transition} (${prefs.transitionDurationFrames} frames).`);
  if (prefs.title.trim()) lines.push(`TITLE: ${prefs.title.trim()}`);
  if (prefs.styleNotes.trim()) lines.push(`STYLE NOTES: ${prefs.styleNotes.trim()}`);

  lines.push("\nAVAILABLE VIDEO RUSHES:");
  for (const v of videos) {
    lines.push(`- id=${v.id} duration=${(v.durationSec ?? 0).toFixed(1)}s name="${v.originalName}"`);
  }
  if (images.length) {
    lines.push("\nAVAILABLE IMAGES (for image overlays):");
    for (const im of images) lines.push(`- id=${im.id} name="${im.originalName}"`);
  }
  if (audios.length) {
    lines.push("\nAVAILABLE MUSIC TRACKS:");
    for (const a of audios) lines.push(`- id=${a.id} name="${a.originalName}"`);
  }

  lines.push("\nTRANSCRIPTS (per rush, with timings in seconds):");
  if (Object.keys(transcripts).length === 0) {
    lines.push("(none yet — base your edit on durations and the script)");
  } else {
    for (const v of videos) {
      const tr = transcripts[v.id];
      if (!tr) continue;
      lines.push(`\n# rush ${v.id}`);
      lines.push(summariseTranscript(tr, 2000));
    }
  }

  lines.push("\nSCRIPT (the desired final narrative):");
  lines.push(script.trim() || "(no script provided)");

  lines.push("\nReturn ONLY the JSON edit object now.");
  return lines.join("\n");
}
