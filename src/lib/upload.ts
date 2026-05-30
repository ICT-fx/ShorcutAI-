/**
 * Ingestion: persist an uploaded file through the StorageAdapter, hash it for
 * transcript caching, record it in the DB, and probe video/audio metadata.
 */
import { createHash, randomUUID } from "node:crypto";
import type { MediaAsset } from "@prisma/client";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { probeMedia } from "@/lib/media/probe";
import { getStorage } from "@/lib/storage";
import type { MediaKind } from "@/lib/types";

function kindFromMime(mime: string, name: string): MediaKind {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  // Fallback on extension.
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["mp4", "mov", "webm", "mkv", "avi", "m4v"].includes(ext)) return "video";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "image";
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext)) return "audio";
  return "video";
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

export async function ingestUpload(projectId: string, file: File): Promise<MediaAsset> {
  const sizeBytes = file.size;
  const maxBytes = config.limits.maxUploadMb * 1024 * 1024;
  if (maxBytes > 0 && sizeBytes > maxBytes) {
    throw new Error(
      `File "${file.name}" is ${(sizeBytes / 1024 / 1024).toFixed(1)}MB, exceeds limit of ${config.limits.maxUploadMb}MB.`,
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const kind = kindFromMime(file.type || "", file.name);
  const storageKey = `projects/${projectId}/${randomUUID()}-${sanitize(file.name)}`;

  const storage = getStorage();
  await storage.put(storageKey, bytes, { contentType: file.type || undefined });

  let asset = await prisma.mediaAsset.create({
    data: {
      projectId,
      kind,
      originalName: file.name,
      storageKey,
      mimeType: file.type || "application/octet-stream",
      sizeBytes,
      contentHash,
    },
  });

  // Probe video/audio so the editor and validator know real bounds.
  if (kind === "video" || kind === "audio") {
    try {
      const probe = await probeMedia(storage, storageKey);
      // Reject clips longer than the configured cap.
      if (
        config.limits.maxClipSeconds > 0 &&
        probe.durationSec &&
        probe.durationSec > config.limits.maxClipSeconds
      ) {
        await storage.remove(storageKey);
        await prisma.mediaAsset.delete({ where: { id: asset.id } });
        throw new Error(
          `"${file.name}" is ${probe.durationSec.toFixed(0)}s, exceeds MAX_CLIP_SECONDS (${config.limits.maxClipSeconds}s).`,
        );
      }
      asset = await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          durationSec: probe.durationSec,
          width: probe.width,
          height: probe.height,
          fps: probe.fps,
          hasAudio: probe.hasAudio,
          probeJson: JSON.stringify(probe),
        },
      });
    } catch (err) {
      // If the error is our own size guard, rethrow; otherwise keep the asset
      // unprobed (the editor uses fallbacks) but surface a warning server-side.
      if (err instanceof Error && err.message.includes("MAX_CLIP_SECONDS")) throw err;
      console.warn(`Probe failed for ${file.name}:`, err);
    }
  }

  return asset;
}
