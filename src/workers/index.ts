/**
 * BullMQ worker process. Run alongside the Next app (`npm run worker`) to
 * process render + transcription jobs out of the request cycle. If you don't
 * run Redis at all, the app falls back to running jobs in-process — this worker
 * is the recommended path for anything beyond a quick local demo.
 */
import { Worker } from "bullmq";
import { config } from "@/lib/config";
import { runRenderJob, runTranscribeJob } from "@/lib/jobs/processors";
import { getRedis } from "@/lib/queue/connection";
import { QUEUE_NAMES, type RenderJobData, type TranscribeJobData } from "@/lib/queue/queues";

// `as any`: BullMQ bundles its own ioredis copy (nominal type mismatch only).
const connection = getRedis() as any;

const renderWorker = new Worker<RenderJobData>(
  QUEUE_NAMES.render,
  async (job) => {
    await runRenderJob(job.data.jobId);
  },
  { connection, concurrency: 1 }, // renders are CPU-heavy → serialize
);

const transcribeWorker = new Worker<TranscribeJobData>(
  QUEUE_NAMES.transcribe,
  async (job) => {
    await runTranscribeJob(job.data.jobId, job.data.mediaAssetId);
  },
  { connection, concurrency: 2 },
);

for (const [name, w] of [
  ["render", renderWorker],
  ["transcribe", transcribeWorker],
] as const) {
  w.on("completed", (job) => console.log(`[${name}] completed job ${job.id}`));
  w.on("failed", (job, err) => console.error(`[${name}] failed job ${job?.id}:`, err.message));
}

console.log(`Workers online. Redis: ${config.redisUrl}`);
console.log("Listening on queues:", Object.values(QUEUE_NAMES).join(", "));

async function shutdown() {
  console.log("\nShutting down workers…");
  await Promise.allSettled([renderWorker.close(), transcribeWorker.close()]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
