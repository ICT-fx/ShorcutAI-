import { NextResponse } from "next/server";
import { requireProject } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { compileEDL } from "@/lib/edl/compile";
import { parseEDL } from "@/lib/edl/schema";
import { getProjectMedia } from "@/lib/project";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/projects/:id/compiled — compiled <AutoEdit> props for the <Player>.
// Returns { props: null } when no EDL has been generated yet.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await requireProject(id);
  if (guard.error) return guard.error;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.edlJson) return NextResponse.json({ props: null });

  const edl = parseEDL(JSON.parse(project.edlJson));
  const media = await getProjectMedia(id);
  const props = compileEDL(edl, media);

  return NextResponse.json({
    props,
    source: project.edlSource,
    durationInFrames: props.meta.durationInFrames,
    fps: props.meta.fps,
    width: props.meta.width,
    height: props.meta.height,
  });
}
