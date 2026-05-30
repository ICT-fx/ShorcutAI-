import { NextResponse } from "next/server";
import { requireProject } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/assets/:id — remove a single media asset (owner only)
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const guard = await requireProject(asset.projectId);
  if (guard.error) return guard.error;

  await getStorage().remove(asset.storageKey).catch(() => {});
  await prisma.mediaAsset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
