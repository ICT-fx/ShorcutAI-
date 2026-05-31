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
import { buildToolboxPrompt, toolTypeList } from "./toolbox";

export const SYSTEM_PROMPT = `You are a senior short-form video editor. You are given raw clips (rushes), still images, an optional music track, the transcript of each rush (with timings), the creator's script, and editing preferences. Your job: decide the EDIT — which parts of which rushes to keep, in what order, what on-screen text overlays to add, and which transitions to use.

You MUST respond with a SINGLE JSON object and NOTHING else (no prose, no markdown fences). The JSON has exactly these top-level keys:

{
  "clips": [
    { "id": "clip-1", "sourceId": "<id of a VIDEO asset>", "inPoint": <seconds>, "outPoint": <seconds>, "volume": <0..1 optional>, "effect": "none|zoomIn|zoomOut (optional, subtle in-clip push-in/out)" }
  ],
  "overlays": [
    { "id": "ov-1", "kind": "text", "content": "<text to display>", "startFrame": <int>, "endFrame": <int>, "position": {"x":0.5,"y":0.14}, "animation": "none|fadeIn|slideUp|slideDown|scaleIn" },
    { "id": "ov-2", "kind": "image", "content": "<id of an IMAGE asset>", "startFrame": <int>, "endFrame": <int>, "position": "top|bottom", "widthFraction": <0..1 optional> }
  ],
  "transitions": [
    { "afterClipId": "clip-1", "type": "cut|fade|slide|slideUp|zoom|wipe", "durationInFrames": <int> }
  ],
  "elements": [
    { "id": "el-1", "type": "<one of the AVAILABLE MOTION-GRAPHICS TOOLS listed below>", "params": { ...per that tool's PARAMS }, "startFrame": <int>, "endFrame": <int> }
  ],
  "audio": { "musicTrackId": "<id of an AUDIO asset, optional>", "duckUnderVoice": true, "musicVolume": 0.18 }
}

HARD RULES (a validator will reject violations and you will be asked to fix them):
- "sourceId" MUST be one of the provided VIDEO asset ids. Image overlays' "content" MUST be a provided IMAGE asset id. "musicTrackId" MUST be a provided AUDIO asset id.
- 0 <= inPoint < outPoint <= the source's duration (seconds). Never exceed the duration.
- At least one clip is required. Clips do NOT need to be contiguous and you must NOT keep the whole take: actively DROP silences/dead air, filler ("euh", "bah"), false starts, repetitions and weak/boring passages. It is expected and correct to leave gaps in the source timeline where you removed material.
- ALIGN every inPoint and outPoint to a natural PAUSE (one of the listed silences) or a sentence boundary — NEVER cut in the middle of a word or a phrase. A cut/transition lands exactly at a clip boundary, so a boundary placed mid-sentence will audibly chop speech. Start a clip right when a phrase begins and end it right when a phrase finishes.
- All *Frame values are integers at the given fps. startFrame < endFrame.
- "transitions[].afterClipId" must reference a clip id you output.
- "elements" are motion-graphics drawn by the tools listed under AVAILABLE MOTION-GRAPHICS TOOLS. Each element's "type" MUST be one of those tool types and its "params" MUST match that tool's PARAMS exactly. Add an element ONLY when that tool's "WHEN TO USE" genuinely applies at that moment, OR when the creator explicitly asked for it. Do NOT invent tools or params that are not listed. If no tool fits, output "elements": []. startFrame < endFrame, integers at the given fps. Follow the EDIT PLAN below when one is provided.
- Do NOT output captions, the intro title, or meta — those are added automatically by the app. In particular, do NOT create a title-card overlay at the start that repeats the video title; the app already places it. Your overlays are for IN-VIDEO callouts (hooks, list items, key points, CTAs).
- You MAY (and for a single long rush SHOULD) output MULTIPLE clips that reuse the same sourceId with different inPoint/outPoint — that is how you create jump cuts from one take.
- Keep the total edit within the requested target duration when one is given.

EDITORIAL GUIDANCE:
- The EDITING PLAYBOOK and STYLE NOTES (plus any instructions in the script) are the creator's explicit creative direction — treat them as the TOP priority. They dictate pacing, tone, energy, what to keep vs cut, and the overall vibe. If they conflict with your defaults, follow them. The PLAYBOOK is the creator's standing method (applies to every video); STYLE NOTES are specific to this video — honour both. Note: the script field may contain a brief/instructions rather than literal narration — read it as intent, do not put it on screen.
- DYNAMIC EDITING / JUMP CUTS: Use the per-rush transcript timings to cut aggressively. Split a long take into MANY short clips, dropping hesitations ("euh", "hmm"), false starts, repetitions and dead air — keep only the strong moments. More, shorter clips = more pace, and they create the cut points where transitions/zooms live. A 45s talking-head take typically becomes ~6–15 tight clips for a dynamic edit.
- LISTS / RANKINGS: If the content is a ranked list (e.g. a "top 4"), add ONE text overlay per item that NAMES it (e.g. "#4 — Japon", "#3 — Italie"), and time each overlay to the transcript moment where that item is actually introduced — never evenly spaced. Find the item names in the transcript; don't output bare "#1/#2" with no name.
- Use text overlays (not the title) for hooks, key points and calls to action at the right moments — convert seconds to frames with fps. Keep overlay text SHORT (a few words); never paste long sentences or the whole script.
- OVERLAY PLACEMENT: this is a vertical (9:16) talking-head — the speaker's face is in the CENTRE, so NEVER put text there. Place callouts in the UPPER area using normalized coordinates {"x":0.5,"y":...}. Section/chapter labels (e.g. "#4 — Japon") go near the top at y≈0.13. Supporting/argument lines go a bit lower but still high, y≈0.27, so they sit above the face, not on it. Use "bottom" only for the occasional lower-third. Keep a section label and its argument from overlapping (different y).
- TRANSITIONS — KEEP IT CLEAN, NOT BUSY: hard "cut" is the backbone of a professional edit; use it for most cut points. Add the occasional "fade" between sections, and a "zoom" transition only to punch into a key reveal. Use slide/slideUp/wipe very rarely — overusing them looks messy. Animated transitions are short, ~6–10 frames.
- IN-CLIP ZOOMS: for subtle life, set a clip's "effect" to "zoomIn" on a FEW emphasis clips (e.g. the moment each list item is revealed) — sparingly, not on every clip. This adds movement without extra cuts.`;

/**
 * The full system prompt for the EDIT phase: the stable rules above + the
 * generated toolbox (the motion-graphics tools the AI may place as "elements").
 * Stable across projects, so it is prompt-cached by the caller.
 */
export function buildEditSystemPrompt(): string {
  return `${SYSTEM_PROMPT}

AVAILABLE MOTION-GRAPHICS TOOLS (valid "elements[].type" values: ${toolTypeList()}):
${buildToolboxPrompt()}`;
}

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

/** Notable silences (dead air) from gaps between consecutive words — ideal cut
 * points and the first thing to remove for a dynamic edit. */
function computePauses(tr: TranscriptResult, minGapSec = 0.45): Array<[number, number]> {
  const words = tr.words ?? [];
  const pauses: Array<[number, number]> = [];
  if (words.length === 0) return pauses;
  if (words[0].start >= minGapSec) pauses.push([0, words[0].start]);
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= minGapSec) pauses.push([words[i - 1].end, words[i].start]);
  }
  const last = words[words.length - 1].end;
  if (tr.durationSec && tr.durationSec - last >= minGapSec) pauses.push([last, tr.durationSec]);
  return pauses;
}

// How hard to trim, by pacing preference.
const TRIM_GUIDANCE: Record<EditPreferences["pace"], string> = {
  slow: "PACING slow: keep a calm, breathable rhythm — trim only clear dead air and obvious mistakes; longer clips are fine.",
  medium: "PACING medium: trim dead air, filler and the weaker passages; the edit should be tighter than the raw footage.",
  fast: "PACING fast / very dynamic: be RUTHLESS. Cut every silence, filler word, false start, repetition and any passage that isn't strong. The final edit should be CLEARLY SHORTER than the raw footage (roughly half to two-thirds of it). Many short punchy clips.",
};

export interface LlmPromptInput {
  prefs: EditPreferences;
  media: MediaInfo[];
  transcripts: Record<string, TranscriptResult>;
  script: string;
  /** Owner's standing editing playbook (from settings) — top-priority direction. */
  playbook?: string;
  width: number;
  height: number;
}

/**
 * The per-project context shared by BOTH phases (plan + edit): format/pacing,
 * the creator's brief (playbook/title/style notes), the available media, the
 * transcripts with timings + pauses, and the script. Kept in one place so the
 * planner and the editor reason over identical inputs.
 */
export function buildSharedContext(input: LlmPromptInput): string {
  const { prefs, media, transcripts, script, playbook, width, height } = input;
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
  lines.push(TRIM_GUIDANCE[prefs.pace]);
  if (playbook?.trim()) {
    lines.push(
      `\nEDITING PLAYBOOK (the creator's standing rules — TOP priority, apply to this edit; if they conflict with defaults, follow the playbook):\n${playbook.trim()}`,
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
      const pauses = computePauses(tr);
      if (pauses.length) {
        lines.push(
          `PAUSES / DEAD AIR in ${v.id} (cut on these, and drop the long ones): ` +
            pauses.map(([s, e]) => `[${s.toFixed(1)}-${e.toFixed(1)}]`).join(" "),
        );
      }
    }
  }

  lines.push("\nSCRIPT (the desired final narrative):");
  lines.push(script.trim() || "(no script provided)");

  return lines.join("\n");
}

/**
 * The EDIT-phase user prompt: shared context + (optional) the Phase-1 plan to
 * follow + the "return JSON" instruction.
 */
export function buildUserPrompt(input: LlmPromptInput, plan?: string): string {
  const lines = [buildSharedContext(input)];
  if (plan?.trim()) {
    lines.push(
      `\nEDIT PLAN (produced in the planning step — FOLLOW IT; it already chose which tools/elements to use and where):\n${plan.trim()}`,
    );
  }
  lines.push("\nReturn ONLY the JSON edit object now.");
  return lines.join("\n");
}
