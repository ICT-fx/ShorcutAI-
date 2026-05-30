import { Queue } from "bullmq";
import { getRedis } from "./connection";

export const QUEUE_NAMES = {
  render: "render",
  transcribe: "transcribe",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface RenderJobData {
  jobId: string;
  projectId: string;
}
export interface TranscribeJobData {
  jobId: string;
  mediaAssetId: string;
}

const queues = new Map<string, Queue>();

export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    // `as any`: BullMQ bundles its own ioredis copy, so the shared client is a
    // nominally-different (but runtime-identical) type. Safe to pass through.
    q = new Queue(name, { connection: getRedis() as any });
    queues.set(name, q);
  }
  return q;
}
