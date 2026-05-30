import { NextResponse } from "next/server";
import { requireProject } from "@/lib/api-auth";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { enqueueRender } from "@/lib/jobs";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/projects/:id/render — enqueue (or inline-run) a render job.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await requireProject(id);
  if (guard.error) return guard.error;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.edlJson) {
    return NextResponse.json({ error: "Generate an edit (EDL) before rendering." }, { status: 400 });
  }

  // Guard render cost: cap total duration.
  const seconds = (project.durationInFrames ?? 0) / (project.fps || 30);
  if (config.limits.maxRenderSeconds > 0 && seconds > config.limits.maxRenderSeconds) {
    return NextResponse.json(
      { error: `Edit is ${seconds.toFixed(0)}s, exceeds MAX_RENDER_SECONDS (${config.limits.maxRenderSeconds}s).` },
      { status: 400 },
    );
  }

  const { jobId, mode } = await enqueueRender(id);
  return NextResponse.json({ jobId, mode });
}
