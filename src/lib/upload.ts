/**
 * Ingestion: persist an uploaded file through the StorageAdapter, hash it for
 * transcript caching, record it in the DB, and probe video/audio metadata.
 * Videos in a codec Chrome can't render (e.g. iPhone HEVC) are transcoded to
 * H.264 on the way in (requires ffmpeg; no-op without it).
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { MediaAsset } from "@prisma/client";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { probeFile, type ProbeResult } from "@/lib/media/probe";
import {
  isChromeCompatibleCodec,
  isFfmpegAvailable,
  probeVideoCodec,
  transcodeToH264,
} from "@/lib/media/transcode";
import { getStorage } from "@/lib/storage";
import type { MediaKind } from "@/lib/types";

function kindFromMime(mime: string, name: string): MediaKind {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
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
  const maxBytes = config.limits.maxUploadMb * 1024 * 1024;
  if (maxBytes > 0 && file.size > maxBytes) {
    throw new Error(
      `"${file.name}" fait ${(file.size / 1024 / 1024).toFixed(1)}Mo, au-delà de la limite de ${config.limits.maxUploadMb}Mo.`,
    );
  }

  let bytes = Buffer.from(await file.arrayBuffer());
  const kind = kindFromMime(file.type || "", file.name);
  let originalName = file.name;
  let mimeType = file.type || "application/octet-stream";
  let transcoded = false;
  let probe: ProbeResult | null = null;

  const tempDir = await mkdtemp(path.join(tmpdir(), "ingest-"));
  try {
    if (kind === "video" || kind === "audio") {
      const inExt = path.extname(file.name) || (kind === "video" ? ".mp4" : ".m4a");
      const inPath = path.join(tempDir, `in${inExt}`);
      await writeFile(inPath, bytes);

      let probePath = inPath;
      if (kind === "video" && (await isFfmpegAvailable())) {
        const codec = await probeVideoCodec(inPath);
        if (!isChromeCompatibleCodec(codec)) {
          const outPath = path.join(tempDir, "out.mp4");
          await transcodeToH264(inPath, outPath);
          bytes = await readFile(outPath);
          mimeType = "video/mp4";
          originalName = originalName.replace(/\.[^.]+$/, "") + ".mp4";
          probePath = outPath;
          transcoded = true;
        }
      }

      try {
        probe = await probeFile(probePath);
      } catch (err) {
        console.warn(`Probe failed for ${file.name}:`, err);
      }

      if (
        config.limits.maxClipSeconds > 0 &&
        probe?.durationSec &&
        probe.durationSec > config.limits.maxClipSeconds
      ) {
        throw new Error(
          `"${file.name}" fait ${probe.durationSec.toFixed(0)}s, au-delà de MAX_CLIP_SECONDS (${config.limits.maxClipSeconds}s).`,
        );
      }
    }

    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const storageKey = `projects/${projectId}/${randomUUID()}-${sanitize(originalName)}`;
    const storage = getStorage();
    await storage.put(storageKey, bytes, { contentType: mimeType });

    return prisma.mediaAsset.create({
      data: {
        projectId,
        kind,
        originalName,
        storageKey,
        mimeType,
        sizeBytes: bytes.length,
        contentHash,
        durationSec: probe?.durationSec ?? null,
        width: probe?.width ?? null,
        height: probe?.height ?? null,
        fps: probe?.fps ?? null,
        hasAudio: probe?.hasAudio ?? false,
        probeJson: probe ? JSON.stringify({ ...probe, transcoded }) : null,
      },
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
