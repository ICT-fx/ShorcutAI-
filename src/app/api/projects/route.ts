import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { EditPreferencesSchema, FORMAT_DIMENSIONS } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/projects — list the current user's projects (newest first)
export async function GET() {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const projects = await prisma.project.findMany({
    where: userId ? { userId } : {},
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { media: true, jobs: true } } },
  });
  return NextResponse.json({ projects });
}

// POST /api/projects — create a project owned by the current user
export async function POST(req: Request) {
  const { error, userId } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const prefs = EditPreferencesSchema.parse(body.preferences ?? {});
  const dims = FORMAT_DIMENSIONS[prefs.format];

  const project = await prisma.project.create({
    data: {
      userId,
      title: (body.title as string) || "Untitled project",
      format: prefs.format,
      fps: prefs.fps,
      width: dims.width,
      height: dims.height,
      script: (body.script as string) || "",
      preferences: JSON.stringify(prefs),
    },
  });
  return NextResponse.json({ project }, { status: 201 });
}
