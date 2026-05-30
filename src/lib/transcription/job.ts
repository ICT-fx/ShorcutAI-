/**
 * Transcription job processor. Honours the transcript cache (keyed by file
 * content hash) so a re-uploaded rush is NEVER re-transcribed — a hard cost
 * lever required by the brief.
 */
import { estimateTranscriptionCost } from "@/lib/cost";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { transcribeBytes } from "./index";

export async function runTranscribeJob(jobId: string, mediaAssetId: string): Promise<void> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
  if (!asset) throw new Error(`Media ${mediaAssetId} not found`);

  await prisma.job.update({ where: { id: jobId }, data: { status: "active", progress: 10 } });

  try {
    // --- Cache hit? Re-uploaded identical file → reuse, zero cost. ---
    let transcript = await prisma.transcript.findUnique({
      where: { contentHash: asset.contentHash },
    });

    if (!transcript) {
      const storage = getStorage();
      const bytes = await storage.get(asset.storageKey);
      const result = await transcribeBytes(bytes, asset.originalName);
      const cost = estimateTranscriptionCost(
        result.provider,
        result.durationSec ?? asset.durationSec ?? 0,
      );
      transcript = await prisma.transcript.create({
        data: {
          contentHash: asset.contentHash,
          provider: result.provider,
          language: result.language,
          durationSec: result.durationSec ?? asset.durationSec,
          segmentsJson: JSON.stringify(result.segments),
          wordsJson: JSON.stringify(result.words),
          costJson: JSON.stringify(cost),
        },
      });
      await prisma.job.update({ where: { id: jobId }, data: { costJson: JSON.stringify(cost) } });
    } else {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          costJson: JSON.stringify({ kind: "transcription", cached: true, estimatedUsd: 0 }),
        },
      });
    }

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "completed",
        progress: 100,
        resultJson: JSON.stringify({ transcriptId: transcript.id, mediaAssetId }),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "failed", errorText: message },
    });
    throw err;
  }
}
