/**
 * Job orchestration. Creates the durable Job row, then either pushes to BullMQ
 * (if Redis is reachable) or runs the processor in-process (detached) so the
 * HTTP request returns immediately. Either way the client polls Job status.
 */
import { prisma } from "@/lib/db";
import { isRedisAvailable } from "@/lib/queue/connection";
import { getQueue, QUEUE_NAMES, type RenderJobData, type TranscribeJobData } from "@/lib/queue/queues";
import { runRenderJob } from "./processors";

export interface EnqueueResult {
  jobId: string;
  mode: "queued" | "inline";
}

export async function enqueueRender(projectId: string): Promise<EnqueueResult> {
  const job = await prisma.job.create({
    data: { projectId, type: "render", status: "queued" },
  });

  if (await isRedisAvailable()) {
    const data: RenderJobData = { jobId: job.id, projectId };
    const bull = await getQueue(QUEUE_NAMES.render).add("render", data, {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    await prisma.job.update({ where: { id: job.id }, data: { bullJobId: String(bull.id) } });
    return { jobId: job.id, mode: "queued" };
  }

  // No Redis → inline, detached. Durable enough for local/single-node use.
  void import("./processors").then((m) => m.runRenderJob(job.id)).catch(() => {});
  return { jobId: job.id, mode: "inline" };
}

export async function enqueueTranscription(mediaAssetId: string): Promise<EnqueueResult> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
  if (!asset) throw new Error(`Media ${mediaAssetId} not found`);

  const job = await prisma.job.create({
    data: { projectId: asset.projectId, type: "transcribe", status: "queued" },
  });

  if (await isRedisAvailable()) {
    const data: TranscribeJobData = { jobId: job.id, mediaAssetId };
    const bull = await getQueue(QUEUE_NAMES.transcribe).add("transcribe", data, {
      attempts: 2,
      backoff: { type: "fixed", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    await prisma.job.update({ where: { id: job.id }, data: { bullJobId: String(bull.id) } });
    return { jobId: job.id, mode: "queued" };
  }

  void import("./processors")
    .then((m) => m.runTranscribeJob(job.id, mediaAssetId))
    .catch(() => {});
  return { jobId: job.id, mode: "inline" };
}
