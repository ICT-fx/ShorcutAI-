/**
 * The LLM editorial layer (Phase 3). Produces an editorial skeleton via the
 * Anthropic API, injects captions deterministically from the transcript, then
 * validates against the real media. On validation failure it feeds the errors
 * back to the model (repair loop, capped attempts). If it ultimately fails, the
 * caller (generate.ts) falls back to the deterministic editor — the app never
 * fails to produce a video.
 *
 * Prompt caching: the large, stable SYSTEM prompt is marked ephemeral so repeat
 * generations across projects reuse it at ~0.1x input cost.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Project } from "@prisma/client";
import { config } from "@/lib/config";
import { estimateLlmCost } from "@/lib/cost";
import { FORMAT_DIMENSIONS, type EditPreferences, type MediaInfo, type TranscriptResult } from "@/lib/types";
import { buildCaptionsFromScript, buildCaptionsFromTranscripts } from "@/lib/edl/captions";
import { parseEDL, type EDL } from "@/lib/edl/schema";
import { TITLE_STYLES } from "@/lib/edl/titleStyles";
import { validateEDL } from "@/lib/edl/validate";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

export interface LlmEditInput {
  project: Project;
  prefs: EditPreferences;
  media: MediaInfo[];
  transcripts: Record<string, TranscriptResult>;
  script: string;
  /** The project owner's standing editing playbook (from settings). */
  playbook?: string;
}

interface Skeleton {
  clips: {
    id: string;
    sourceId: string;
    inPoint: number;
    outPoint: number;
    volume?: number;
    effect?: "none" | "zoomIn" | "zoomOut";
  }[];
  overlays?: any[];
  transitions?: any[];
  audio?: any;
}

const toFrame = (sec: number, fps: number) => Math.max(0, Math.round(sec * fps));

/**
 * Keep in-video overlays out of the speaker's face. In a 9:16 talking-head the
 * vertical centre band is where the face sits, so "center" (or any normalized y
 * in that band) is remapped to the upper area. "top"/"bottom" and upper/lower
 * coords are left as the model intended.
 */
function safeOverlayPosition(pos: unknown): unknown {
  if (pos === "center") return { x: 0.5, y: 0.18 };
  if (pos && typeof pos === "object") {
    const p = pos as { x?: number; y?: number };
    if (typeof p.y === "number" && p.y >= 0.34 && p.y <= 0.74) {
      return { x: typeof p.x === "number" ? p.x : 0.5, y: 0.2 };
    }
  }
  return pos;
}

function extractJson(text: string): unknown {
  // Be tolerant of accidental markdown fences or surrounding prose.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model output.");
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Assemble a full EDL from the LLM skeleton + deterministic captions + meta. */
function assembleEDL(skeleton: Skeleton, input: LlmEditInput): EDL {
  const fps = input.prefs.fps;
  const { width, height } = FORMAT_DIMENSIONS[input.prefs.format];

  const clips = (skeleton.clips ?? []).map((c, i) => ({
    id: c.id || `clip-${i + 1}`,
    sourceId: c.sourceId,
    inPoint: Number(c.inPoint) || 0,
    outPoint: Number(c.outPoint) || 0,
    volume: c.volume,
    effect: c.effect,
  }));

  // Captions are NOT taken from the model — always from real timings.
  const totalSec = clips.reduce((a, c) => a + Math.max(0, c.outPoint - c.inPoint), 0);
  let captions = [] as ReturnType<typeof buildCaptionsFromTranscripts>;
  if (input.prefs.captions) {
    captions = Object.keys(input.transcripts).length
      ? buildCaptionsFromTranscripts(clips, fps, input.transcripts, input.prefs.captionStyle)
      : buildCaptionsFromScript(input.script, totalSec, fps);
  }

  // The intro title is app-owned (uses the user's chosen style preset), not the
  // LLM's — inject it so the title always honours the button choice.
  const titleOverlays: any[] = [];
  if (input.prefs.title.trim()) {
    const preset = TITLE_STYLES[input.prefs.titleStyle];
    titleOverlays.push({
      id: "title",
      kind: "text",
      content: input.prefs.title.trim(),
      startFrame: 0,
      endFrame: toFrame(Math.min(2.5, totalSec), fps),
      position: preset.position,
      animation: preset.animation,
      fontFamily: preset.fontKey,
      fontSizePx: Math.round(width * preset.sizeFraction),
      color: preset.color,
      backgroundColor: preset.backgroundColor,
    });
  }
  // Drop any title the model produced anyway, then prepend ours. Repositioning
  // keeps callouts off the speaker's face.
  const modelOverlays = (skeleton.overlays ?? [])
    .filter((o: any) => o?.id !== "title")
    .map((o: any) => ({ ...o, position: safeOverlayPosition(o?.position) }));
  const overlays = [...titleOverlays, ...modelOverlays];

  const clipFrames = clips.reduce((a, c) => a + toFrame(Math.max(0, c.outPoint - c.inPoint), fps), 0);
  const overlayEnd = overlays.reduce((m: number, o: any) => Math.max(m, Number(o?.endFrame) || 0), 0);
  const captionEnd = captions.reduce((m, c) => Math.max(m, c.endFrame), 0);
  const durationInFrames = Math.max(1, clipFrames, overlayEnd, captionEnd);

  return parseEDL({
    version: 1,
    meta: { fps, width, height, durationInFrames },
    tracks: { clips, overlays, captions },
    audio: skeleton.audio ?? undefined,
    transitions: skeleton.transitions ?? [],
    style: { captionFont: input.prefs.captionFont, overlayTemplate: input.prefs.overlayTemplate },
  });
}

export async function generateLlmEDL(input: LlmEditInput): Promise<EDL> {
  if (!config.llm.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY not set; LLM editor unavailable.");
  }
  const client = new Anthropic({ apiKey: config.llm.anthropicApiKey });
  const { width, height } = FORMAT_DIMENSIONS[input.prefs.format];

  const userPrompt = buildUserPrompt({
    prefs: input.prefs,
    media: input.media,
    transcripts: input.transcripts,
    script: input.script,
    playbook: input.playbook,
    width,
    height,
  });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  const maxAttempts = Math.max(1, config.llm.maxRepairAttempts + 1);
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await client.messages.create({
      model: config.llm.model,
      max_tokens: 8000,
      // Stable schema/rules cached; per-project content stays in the user turn.
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages,
    });

    // Log estimated cost (cache reads are ~0.1x; this is a rough upper bound).
    const cost = estimateLlmCost(
      config.llm.model,
      response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0),
      response.usage.output_tokens,
    );
    console.log(
      `[llm] attempt ${attempt} usage in=${response.usage.input_tokens} cached=${response.usage.cache_read_input_tokens ?? 0} out=${response.usage.output_tokens} ~$${cost.estimatedUsd}`,
    );

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      const skeleton = extractJson(text) as Skeleton;
      const edl = assembleEDL(skeleton, input);

      // Cross-check against real media; on failure, feed errors back.
      const v = validateEDL(edl, input.media);
      if (v.ok) return edl;
      lastError = v.errors.join("\n- ");
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < maxAttempts) {
      // Repair turn: keep the assistant's attempt + the validator's complaint.
      messages.push({ role: "assistant", content: text });
      messages.push({
        role: "user",
        content: `The edit was rejected by the validator:\n- ${lastError}\n\nReturn a corrected JSON edit object that fixes these issues. JSON only.`,
      });
    }
  }

  throw new Error(`LLM editor failed validation after ${maxAttempts} attempts: ${lastError}`);
}
