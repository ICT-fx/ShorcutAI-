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
  /** Set when the AI editor was attempted but failed and we fell back to rules. */
  warning?: string;
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
  let warning: string | undefined;

  if (useLlm) {
    try {
      // Lazy import keeps the (optional) Anthropic SDK out of paths that never
      // use it. Implemented in Phase 3.
      const { generateLlmEDL } = await import("@/lib/llm/editorial");
      // The playbook is a best-effort enhancement: a settings/DB error (e.g. a
      // stale Prisma client before a restart) must NEVER drop us to the bare
      // deterministic montage. Fetch it defensively.
      let playbook = "";
      try {
        const { getUserSettings } = await import("@/lib/settings");
        playbook = (await getUserSettings(project.userId)).editingPlaybook;
      } catch (e) {
        console.warn(
          "Editing playbook unavailable; continuing without it:",
          e instanceof Error ? e.message : e,
        );
      }
      const llm = await generateLlmEDL({
        project,
        prefs,
        media,
        transcripts,
        script: project.script,
        playbook,
      });
      edl = llm.edl;
      source = "llm";
      // The creator explicitly asked for capabilities no tool can deliver yet:
      // surface it (and it's logged in the plan step) so they know why it's absent.
      if (llm.unsupportedRequests.length > 0) {
        const asked = llm.unsupportedRequests.map((r) => r.request).join(", ");
        warning = `Tu as demandé : ${asked} — pas encore disponible dans l'éditeur, le montage a été généré sans. On peut ajouter ces effets.`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`LLM editor failed (${msg}); falling back to deterministic.`);
      edl = generateDeterministicEDL({
        media,
        preferences: prefs,
        script: project.script,
        transcripts,
        maxClipSeconds: config.limits.maxClipSeconds,
        trimBounds,
      });
      source = "deterministic";
      warning =
        "L'IA n'a pas pu produire le montage (surcharge ou erreur temporaire), un montage de secours simplifié a été généré — SANS encarts ni coupes dynamiques. Relance « Générer le montage » pour réessayer l'IA.";
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

  return { edl, source, validation, props, warning };
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
