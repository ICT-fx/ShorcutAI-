import { NextResponse } from "next/server";
import { requireProject } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { parsePreferences } from "@/lib/project";
import { EditPreferencesSchema, FORMAT_DIMENSIONS } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/projects/:id — project with media + jobs
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await requireProject(id);
  if (guard.error) return guard.error;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      media: { orderBy: { createdAt: "asc" } },
      jobs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project, preferences: parsePreferences(project) });
}

// PATCH /api/projects/:id — update script / preferences / title
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await requireProject(id);
  if (guard.error) return guard.error;
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const merged = { ...parsePreferences(existing), ...(body.preferences ?? {}) };
  const prefs = EditPreferencesSchema.parse(merged);
  const dims = FORMAT_DIMENSIONS[prefs.format];

  const project = await prisma.project.update({
    where: { id },
    data: {
      title: body.title ?? (prefs.title || existing.title),
      script: body.script ?? existing.script,
      preferences: JSON.stringify(prefs),
      format: prefs.format,
      fps: prefs.fps,
      width: dims.width,
      height: dims.height,
    },
  });
  return NextResponse.json({ project, preferences: prefs });
}

// DELETE /api/projects/:id — remove project + its stored media
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await requireProject(id);
  if (guard.error) return guard.error;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { media: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const storage = getStorage();
  await Promise.allSettled(project.media.map((m) => storage.remove(m.storageKey)));
  await prisma.project.delete({ where: { id } }); // cascades media + jobs
  return NextResponse.json({ ok: true });
}
