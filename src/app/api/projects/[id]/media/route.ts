import { NextResponse } from "next/server";
import { requireProject } from "@/lib/api-auth";
import { ingestUpload } from "@/lib/upload";
import { mediaInfoFromAsset } from "@/lib/project";

export const runtime = "nodejs";
// Uploads can be large; don't let the platform cache or pre-buffer aggressively.
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/projects/:id/media — multipart upload of one or more files
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await requireProject(id);
  if (guard.error) return guard.error;

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided (field name: 'files')" }, { status: 400 });
  }

  const created = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      const asset = await ingestUpload(id, file);
      created.push(mediaInfoFromAsset(asset));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return NextResponse.json({ media: created, errors }, { status: errors.length && !created.length ? 400 : 201 });
}
