/**
 * Job processors — pure functions shared by BOTH the BullMQ worker and the
 * in-process inline fallback. They own the Job/Project status transitions and
 * cost logging. Transcription processor is added in Phase 2.
 */
import { estimateRenderCost } from "@/lib/cost";
import { prisma } from "@/lib/db";
import { renderProject } from "@/lib/render/render";

// Transcription processor (Phase 2) lives in src/lib/transcription. Re-exported
// here so the jobs layer has a single import surface for all processors.
export { runTranscribeJob } from "@/lib/transcription/job";


export async function runRenderJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Job ${jobId} not found`);

  await prisma.job.update({ where: { id: jobId }, data: { status: "active", progress: 0 } });
  await prisma.project
    .update({ where: { id: job.projectId }, data: { status: "rendering" } })
    .catch(() => {});

  // Throttle progress writes (renderMedia fires per-frame).
  let lastWritten = -10;

  try {
    const result = await renderProject(job.projectId, jobId, (pct) => {
      if (pct - lastWritten >= 5 || pct === 100) {
        lastWritten = pct;
        void prisma.job.update({ where: { id: jobId }, data: { progress: pct } }).catch(() => {});
      }
    });

    const cost = estimateRenderCost(result.durationSeconds);
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "completed",
        progress: 100,
        resultJson: JSON.stringify({
          outputKey: result.outputKey,
          url: result.url,
          bytes: result.bytes,
          durationInFrames: result.durationInFrames,
        }),
        costJson: JSON.stringify(cost),
      },
    });
    await prisma.project.update({ where: { id: job.projectId }, data: { status: "done" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "failed", errorText: message },
    });
    await prisma.project
      .update({ where: { id: job.projectId }, data: { status: "error" } })
      .catch(() => {});
    throw err;
  }
}
