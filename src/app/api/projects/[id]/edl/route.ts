import { NextResponse } from "next/server";
import { requireProject } from "@/lib/api-auth";
import { generateProjectEDL, type EdlMode } from "@/lib/edl/generate";

export const runtime = "nodejs";
export const maxDuration = 120; // LLM + repair loop can take a little while

type Ctx = { params: Promise<{ id: string }> };

// POST /api/projects/:id/edl — (re)generate the EDL.
// body: { mode?: "auto" | "deterministic" | "llm" }
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await requireProject(id);
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const mode = (body.mode as EdlMode) ?? "auto";

  try {
    const result = await generateProjectEDL(id, mode);
    return NextResponse.json({
      source: result.source,
      validation: result.validation,
      warning: result.warning,
      props: result.props,
      durationInFrames: result.props.meta.durationInFrames,
      fps: result.props.meta.fps,
      width: result.props.meta.width,
      height: result.props.meta.height,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
