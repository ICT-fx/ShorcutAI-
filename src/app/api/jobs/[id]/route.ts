import { NextResponse } from "next/server";
import { requireProject } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/jobs/:id — poll job status/progress/result (owner only).
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const guard = await requireProject(job.projectId);
  if (guard.error) return guard.error;

  return NextResponse.json({
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    result: job.resultJson ? JSON.parse(job.resultJson) : null,
    cost: job.costJson ? JSON.parse(job.costJson) : null,
    error: job.errorText,
    updatedAt: job.updatedAt,
  });
}
