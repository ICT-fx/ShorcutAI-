/**
 * Ensure every video rush in a project has a transcript before the editor runs.
 *
 * The whole product hinges on speech timings: without a transcript the AI is
 * blind to what's actually said (can't place captions, can't time list/section
 * overlays, can't pick good cut points). Transcription used to be a manual,
 * easy-to-forget button — now generate.ts calls this first.
 *
 * Best-effort: a provider failure on one asset is logged and skipped, never
 * thrown, so the editor still produces a video. Cached by contentHash, so this
 * is a zero-cost no-op on re-generation.
 */
import { estimateTranscriptionCost } from "@/lib/cost";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { transcribeBytes } from "./index";

export async function ensureProjectTranscripts(projectId: string): Promise<number> {
  const assets = await prisma.mediaAsset.findMany({
    where: { projectId, kind: "video" },
  });
  if (assets.length === 0) return 0;

  const hashes = [...new Set(assets.map((a) => a.contentHash))];
  const existing = await prisma.transcript.findMany({
    where: { contentHash: { in: hashes } },
    select: { contentHash: true },
  });
  const have = new Set(existing.map((t) => t.contentHash));

  const storage = getStorage();
  let transcribed = 0;

  for (const asset of assets) {
    if (have.has(asset.contentHash)) continue;
    try {
      const bytes = await storage.get(asset.storageKey);
      const result = await transcribeBytes(bytes, asset.originalName);
      const cost = estimateTranscriptionCost(
        result.provider,
        result.durationSec ?? asset.durationSec ?? 0,
      );
      await prisma.transcript.upsert({
        where: { contentHash: asset.contentHash },
        update: {},
        create: {
          contentHash: asset.contentHash,
          provider: result.provider,
          language: result.language,
          durationSec: result.durationSec ?? asset.durationSec,
          segmentsJson: JSON.stringify(result.segments),
          wordsJson: JSON.stringify(result.words),
          costJson: JSON.stringify(cost),
        },
      });
      have.add(asset.contentHash);
      transcribed++;
    } catch (err) {
      console.warn(
        `[transcribe] auto-transcription failed for "${asset.originalName}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return transcribed;
}
