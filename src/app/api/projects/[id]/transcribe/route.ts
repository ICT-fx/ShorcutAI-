import { NextResponse } from "next/server";
import { requireProject } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { enqueueTranscription } from "@/lib/jobs";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/projects/:id/transcribe — enqueue transcription for the project's
// video/audio assets that don't already have a cached transcript.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await requireProject(id);
  if (guard.error) return guard.error;

  const assets = await prisma.mediaAsset.findMany({
    where: { projectId: id, kind: { in: ["video", "audio"] } },
  });
  if (assets.length === 0) {
    return NextResponse.json({ error: "No transcribable media in this project." }, { status: 400 });
  }

  // Skip assets whose content hash is already transcribed (cache hit).
  const hashes = [...new Set(assets.map((a) => a.contentHash))];
  const cached = await prisma.transcript.findMany({ where: { contentHash: { in: hashes } } });
  const cachedHashes = new Set(cached.map((t) => t.contentHash));

  const jobs = [];
  for (const asset of assets) {
    if (cachedHashes.has(asset.contentHash)) continue;
    const { jobId, mode } = await enqueueTranscription(asset.id);
    jobs.push({ jobId, mode, mediaAssetId: asset.id });
  }

  await prisma.project.update({ where: { id }, data: { status: "transcribing" } }).catch(() => {});
  return NextResponse.json({ jobs, alreadyCached: cachedHashes.size });
}
