/**
 * Shared helpers to turn DB rows into the in-memory shapes the editor, the
 * validator, the compiler and Remotion all consume.
 */
import type { MediaAsset, Project } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import {
  EditPreferencesSchema,
  type EditPreferences,
  type MediaInfo,
  type MediaKind,
  type TranscriptResult,
} from "@/lib/types";

export function mediaInfoFromAsset(asset: MediaAsset): MediaInfo {
  const storage = getStorage();
  return {
    id: asset.id,
    kind: asset.kind as MediaKind,
    originalName: asset.originalName,
    url: storage.publicUrl(asset.storageKey),
    mimeType: asset.mimeType,
    durationSec: asset.durationSec,
    width: asset.width,
    height: asset.height,
    fps: asset.fps,
    hasAudio: asset.hasAudio,
  };
}

export async function getProjectMedia(projectId: string): Promise<MediaInfo[]> {
  const assets = await prisma.mediaAsset.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  return assets.map(mediaInfoFromAsset);
}

/**
 * Loads cached transcripts for a project's media, keyed by media id (= EDL
 * sourceId). Transcripts are stored by contentHash, so this joins media→hash→
 * transcript. Returns only media that actually has a transcript.
 */
export async function getProjectTranscripts(
  projectId: string,
): Promise<Record<string, TranscriptResult>> {
  const assets = await prisma.mediaAsset.findMany({ where: { projectId } });
  const hashes = [...new Set(assets.map((a) => a.contentHash))];
  if (hashes.length === 0) return {};

  const transcripts = await prisma.transcript.findMany({
    where: { contentHash: { in: hashes } },
  });
  const byHash = new Map(transcripts.map((t) => [t.contentHash, t]));

  const out: Record<string, TranscriptResult> = {};
  for (const a of assets) {
    const t = byHash.get(a.contentHash);
    if (!t) continue;
    out[a.id] = {
      provider: t.provider,
      language: t.language ?? undefined,
      durationSec: t.durationSec ?? undefined,
      segments: JSON.parse(t.segmentsJson),
      words: JSON.parse(t.wordsJson),
    };
  }
  return out;
}

export function parsePreferences(project: Pick<Project, "preferences">): EditPreferences {
  let raw: unknown = {};
  try {
    raw = JSON.parse(project.preferences || "{}");
  } catch {
    raw = {};
  }
  // Apply defaults / coerce; never throws — bad data falls back to defaults.
  const parsed = EditPreferencesSchema.safeParse(raw);
  return parsed.success ? parsed.data : EditPreferencesSchema.parse({});
}
