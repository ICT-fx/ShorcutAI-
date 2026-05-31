/**
 * PHASE 1 — the editorial PLAN. Before writing the EDL, the model analyses the
 * rushes + the creator's brief and decides, with the toolbox in hand, WHICH
 * motion-graphics tools to use, WHERE (transcript moment) and WHY — and flags
 * any capability the creator explicitly asked for that no tool can satisfy yet
 * (`unsupportedRequests`). Phase 2 (editorial.ts) then writes the EDL following
 * this plan.
 *
 * Best-effort: if planning fails, the caller proceeds plan-less (the toolbox is
 * still present in the edit prompt), so generation degrades gracefully.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "@/lib/config";
import { buildToolboxPrompt, toolTypeList } from "./toolbox";
import { buildSharedContext, type LlmPromptInput } from "./prompt";

const PlanElementSchema = z.object({
  tool: z.string(),
  atSecondApprox: z.number().optional(),
  transcriptCue: z.string().optional(),
  why: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

const UnsupportedRequestSchema = z.object({
  request: z.string(),
  reason: z.string().optional(),
});

export const PlanSchema = z.object({
  summary: z.string().default(""),
  clipStrategy: z.string().default(""),
  elements: z.array(PlanElementSchema).default([]),
  unsupportedRequests: z.array(UnsupportedRequestSchema).default([]),
});
export type EditorialPlan = z.infer<typeof PlanSchema>;

export interface PlanResult {
  /** Readable rendering of the plan, injected into the Phase-2 edit prompt. */
  planText: string;
  unsupportedRequests: { request: string; reason?: string }[];
}

function planSystemPrompt(): string {
  return `You are the PLANNING brain of a short-form video editor. You do NOT write the final edit yet — you produce a concise PLAN that a second pass will follow.

You are given the creator's brief, the available media, the transcripts (with timings) and the script. You also have a toolbox of MOTION-GRAPHICS TOOLS that can be placed on the timeline as "elements".

Decide:
1. The editorial approach (summary) and how to cut the rushes (clipStrategy).
2. Which tools to use, WHERE (approx second + the transcript cue that triggers it) and WHY. Only choose a tool when its "WHEN TO USE" genuinely applies, OR when the creator explicitly asked for it in the brief/script. It is perfectly fine to use no tools.
3. unsupportedRequests: anything the creator EXPLICITLY asked for that NO tool in the toolbox can deliver (e.g. an animated map, a price reveal) — list the request and a short reason. Do NOT list things the creator didn't ask for.

Respond with a SINGLE JSON object and nothing else:
{
  "summary": "<one short paragraph>",
  "clipStrategy": "<how to cut>",
  "elements": [ { "tool": "<one of: ${toolTypeList()}>", "atSecondApprox": <number>, "transcriptCue": "<the words that trigger it>", "why": "<reason>", "params": { ...suggested params for that tool } } ],
  "unsupportedRequests": [ { "request": "<what they asked for>", "reason": "<why it can't be done yet>" } ]
}

AVAILABLE MOTION-GRAPHICS TOOLS:
${buildToolboxPrompt()}`;
}

function planUserPrompt(input: LlmPromptInput): string {
  return `${buildSharedContext(input)}

Produce ONLY the plan JSON now.`;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in plan output.");
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Render the structured plan into the text injected into the edit prompt. */
function renderPlan(plan: EditorialPlan): string {
  const lines: string[] = [];
  if (plan.summary) lines.push(`Approach: ${plan.summary}`);
  if (plan.clipStrategy) lines.push(`Cutting: ${plan.clipStrategy}`);
  if (plan.elements.length) {
    lines.push("Elements to place:");
    for (const el of plan.elements) {
      const at = el.atSecondApprox != null ? ` @~${el.atSecondApprox}s` : "";
      const cue = el.transcriptCue ? ` (cue: "${el.transcriptCue}")` : "";
      const params = el.params ? ` params=${JSON.stringify(el.params)}` : "";
      lines.push(`- ${el.tool}${at}${cue}${params}${el.why ? ` — ${el.why}` : ""}`);
    }
  } else {
    lines.push("Elements to place: none.");
  }
  return lines.join("\n");
}

/**
 * Run the planning call. Returns the rendered plan + unsupported requests, or
 * null on any failure (caller proceeds plan-less).
 */
export async function generatePlan(
  client: Anthropic,
  input: LlmPromptInput,
): Promise<PlanResult | null> {
  try {
    const response = await client.messages.create({
      model: config.llm.model,
      max_tokens: 2000,
      system: [{ type: "text", text: planSystemPrompt(), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: planUserPrompt(input) }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const plan = PlanSchema.parse(extractJson(text));
    return { planText: renderPlan(plan), unsupportedRequests: plan.unsupportedRequests };
  } catch (err) {
    console.warn(`[llm] planning failed (${err instanceof Error ? err.message : err}); proceeding without a plan.`);
    return null;
  }
}
