/**
 * Media probing WITHOUT a system ffmpeg dependency, using Remotion's pure-JS
 * @remotion/media-parser. Extracts duration / dimensions / fps / audio so the
 * editor and validator know the real bounds of every rush.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseMedia } from "@remotion/media-parser";
import { nodeReader } from "@remotion/media-parser/node";
import type { StorageAdapter } from "@/lib/storage";

export interface ProbeResult {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
  container: string | null;
}

/** Probe a media file that already exists on the local filesystem. */
export async function probeFile(filePath: string): Promise<ProbeResult> {
  const result = await parseMedia({
    src: filePath,
    reader: nodeReader,
    fields: {
      durationInSeconds: true,
      dimensions: true,
      fps: true,
      numberOfAudioChannels: true,
      container: true,
    },
    acknowledgeRemotionLicense: true,
  });
  return {
    durationSec: result.durationInSeconds ?? null,
    width: result.dimensions?.width ?? null,
    height: result.dimensions?.height ?? null,
    fps: result.fps ?? null,
    hasAudio: (result.numberOfAudioChannels ?? 0) > 0,
    container: (result.container as string) ?? null,
  };
}

/**
 * Probe a stored media asset. Prefers the on-disk path (local driver); for
 * remote drivers it downloads to a temp file first.
 */
export async function probeMedia(
  storage: StorageAdapter,
  storageKey: string,
): Promise<ProbeResult> {
  const localPath = storage.localPath(storageKey);
  if (localPath) return probeFile(localPath);

  const bytes = await storage.get(storageKey);
  const tempDir = await mkdtemp(path.join(tmpdir(), "probe-"));
  const filePath = path.join(tempDir, path.basename(storageKey) || "media");
  try {
    await writeFile(filePath, bytes);
    return await probeFile(filePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
