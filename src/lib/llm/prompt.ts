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
    { "afterClipId": "clip-1", "type": "cut|fade|slide|slideUp|zoom|wipe", "durationInFrames": <int> }
  ],
  "audio": { "musicTrackId": "<id of an AUDIO asset, optional>", "duckUnderVoice": true, "musicVolume": 0.18 }
}

HARD RULES (a validator will reject violations and you will be asked to fix them):
- "sourceId" MUST be one of the provided VIDEO asset ids. Image overlays' "content" MUST be a provided IMAGE asset id. "musicTrackId" MUST be a provided AUDIO asset id.
- 0 <= inPoint < outPoint <= the source's duration (seconds). Never exceed the duration.
- At least one clip is required. Prefer trimming dead air / filler over keeping everything.
- All *Frame values are integers at the given fps. startFrame < endFrame.
- "transitions[].afterClipId" must reference a clip id you output.
- Do NOT output captions, the intro title, or meta — those are added automatically by the app. In particular, do NOT create a title-card overlay at the start that repeats the video title; the app already places it. Your overlays are for IN-VIDEO callouts (hooks, list items, key points, CTAs).
- You MAY (and for a single long rush SHOULD) output MULTIPLE clips that reuse the same sourceId with different inPoint/outPoint — that is how you create jump cuts from one take.
- Keep the total edit within the requested target duration when one is given.

EDITORIAL GUIDANCE:
- The STYLE NOTES (and any instructions in the script) are the creator's explicit creative direction — treat them as the TOP priority. They dictate pacing, tone, energy, what to keep vs cut, and the overall vibe. If they conflict with your defaults, follow them. Note: the script field may contain a brief/instructions rather than literal narration — read it as intent, do not put it on screen.
- DYNAMIC EDITING / JUMP CUTS: Use the per-rush transcript timings to cut aggressively. Split a long take into MANY short clips, dropping hesitations ("euh", "hmm"), false starts, repetitions and dead air — keep only the strong moments. More, shorter clips = more pace, and they create the cut points where transitions/zooms live. A 45s talking-head take typically becomes ~6–15 tight clips for a dynamic edit.
- LISTS / RANKINGS: If the content is a ranked list (e.g. a "top 4"), add ONE text overlay per item that NAMES it (e.g. "#4 — Japon", "#3 — Italie"), and time each overlay to the transcript moment where that item is actually introduced — never evenly spaced. Find the item names in the transcript; don't output bare "#1/#2" with no name.
- Use text overlays (not the title) for hooks, key points and calls to action at the right moments — convert seconds to frames with fps. Keep overlay text SHORT (a few words); never paste long sentences or the whole script.
- TRANSITIONS: pick a type per cut from cut|fade|slide|slideUp|zoom|wipe and VARY them to fit the moment. Energetic/punchy edits can use zoom, slide, wipe and slideUp to build momentum; calm, serious or emotional content should stay sober (mostly "cut", the occasional "fade"). Don't repeat the same transition on every cut unless the style explicitly calls for it. "cut" (instant) is always valid and is the right default for tight, fast dialogue. Animated transitions are usually 6–14 frames.`;

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
  if (prefs.transition === "auto") {
    lines.push(
      `PACING: ${prefs.pace}. TRANSITIONS: AUTO — you decide the transition type for EACH cut and vary them to fit the pacing and energy (see guidance). Use ~${prefs.transitionDurationFrames} frames for animated ones.`,
    );
  } else {
    lines.push(
      `PACING: ${prefs.pace}. DEFAULT TRANSITION: ${prefs.transition} (${prefs.transitionDurationFrames} frames) — use it as the default, but you may vary when it genuinely serves the edit.`,
    );
  }
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
