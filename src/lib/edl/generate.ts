/**
 * EDL generation orchestrator. Chooses the editor (deterministic vs LLM),
 * validates the result against real media, compiles preview/render props, and
 * persists the EDL on the project. The LLM path (Phase 3) ALWAYS falls back to
 * the deterministic editor so the app never fails to produce a video.
 */
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { nonSilentBounds } from "@/lib/media/silence";
import { getProjectMedia, getProjectTranscripts, parsePreferences } from "@/lib/project";
import { getStorage } from "@/lib/storage";
import { compileEDL, type AutoEditProps } from "./compile";
import { generateDeterministicEDL } from "./deterministic";
import type { EDL } from "./schema";
import { validateEDL, type ValidationResult } from "./validate";

export type EdlMode = "deterministic" | "llm" | "auto";

export interface GenerateResult {
  edl: EDL;
  source: "deterministic" | "llm";
  validation: ValidationResult;
  props: AutoEditProps;
}

export async function generateProjectEDL(
  projectId: string,
  mode: EdlMode = "auto",
): Promise<GenerateResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Project ${projectId} not found`);

  const media = await getProjectMedia(projectId);
  const prefs = parsePreferences(project);

  // Transcribe any rush that isn't transcribed yet (cached, best-effort). The
  // editor needs speech timings for real captions and well-timed overlays/cuts.
  const { ensureProjectTranscripts } = await import("@/lib/transcription/ensure");
  await ensureProjectTranscripts(projectId);
  const transcripts = await getProjectTranscripts(projectId);

  // Phase 4: optional silence trimming (best-effort, needs ffmpeg + local files).
  const trimBounds = prefs.removeSilences ? await computeTrimBounds(projectId) : undefined;

  const useLlm = mode === "llm" || (mode === "auto" && config.llm.enabled);

  let edl: EDL;
  let source: "deterministic" | "llm";

  if (useLlm) {
    try {
      // Lazy import keeps the (optional) Anthropic SDK out of paths that never
      // use it. Implemented in Phase 3.
      const { generateLlmEDL } = await import("@/lib/llm/editorial");
      edl = await generateLlmEDL({ project, prefs, media, transcripts, script: project.script });
      source = "llm";
    } catch (err) {
      console.warn(
        `LLM editor failed (${err instanceof Error ? err.message : err}); falling back to deterministic.`,
      );
      edl = generateDeterministicEDL({
        media,
        preferences: prefs,
        script: project.script,
        transcripts,
        maxClipSeconds: config.limits.maxClipSeconds,
        trimBounds,
      });
      source = "deterministic";
    }
  } else {
    edl = generateDeterministicEDL({
      media,
      preferences: prefs,
      script: project.script,
      transcripts,
      maxClipSeconds: config.limits.maxClipSeconds,
    });
    source = "deterministic";
  }

  const validation = validateEDL(edl, media);
  const props = compileEDL(edl, media);

  await prisma.project.update({
    where: { id: projectId },
    data: {
      edlJson: JSON.stringify(edl),
      edlSource: source,
      durationInFrames: props.meta.durationInFrames,
      status: "ready",
    },
  });

  return { edl, source, validation, props };
}

/**
 * Best-effort per-rush non-silent bounds. Returns {} if ffmpeg is unavailable
 * or storage is remote (no local path to probe) — the editor then keeps full
 * clips. Never throws.
 */
async function computeTrimBounds(
  projectId: string,
): Promise<Record<string, { start: number; end: number }>> {
  const storage = getStorage();
  const assets = await prisma.mediaAsset.findMany({
    where: { projectId, kind: "video" },
  });
  const out: Record<string, { start: number; end: number }> = {};
  for (const a of assets) {
    const localPath = storage.localPath(a.storageKey);
    if (!localPath || !a.durationSec) continue;
    try {
      out[a.id] = await nonSilentBounds(localPath, a.durationSec);
    } catch {
      /* keep full clip on failure */
    }
  }
  return out;
}
