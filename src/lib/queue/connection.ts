/**
 * Redis connection for BullMQ, with a graceful availability probe. If Redis is
 * not reachable, the jobs layer falls back to running work in-process so the
 * whole app still functions on a bare machine (no paid/extra infra required).
 */
import IORedis, { type Redis } from "ioredis";
import { config } from "@/lib/config";

let connection: Redis | null = null;

export function getRedis(): Redis {
  if (!connection) {
    connection = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
      lazyConnect: true,
    });
    connection.on("error", () => {
      /* swallow — availability is probed explicitly */
    });
  }
  return connection;
}

let availabilityCache: { value: boolean; at: number } | null = null;
const AVAILABILITY_TTL_MS = 15_000;

/** Probe whether Redis is reachable (cached briefly). */
export async function isRedisAvailable(): Promise<boolean> {
  if (availabilityCache && Date.now() - availabilityCache.at < AVAILABILITY_TTL_MS) {
    return availabilityCache.value;
  }
  let ok = false;
  const probe = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 1000,
    retryStrategy: () => null, // do not retry the probe
  });
  probe.on("error", () => {});
  try {
    await probe.connect();
    const pong = await probe.ping();
    ok = pong === "PONG";
  } catch {
    ok = false;
  } finally {
    probe.disconnect();
  }
  availabilityCache = { value: ok, at: Date.now() };
  return ok;
}
