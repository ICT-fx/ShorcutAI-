import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getUserSettings, setEditingPlaybook } from "@/lib/settings";

export const runtime = "nodejs";

// GET /api/settings — the current user's settings (editing playbook).
export async function GET() {
  const guard = await requireAuth();
  if (guard.error) return guard.error;
  return NextResponse.json(await getUserSettings(guard.userId));
}

// PUT /api/settings — save the editing playbook.
export async function PUT(req: Request) {
  const guard = await requireAuth();
  if (guard.error) return guard.error;
  const body = await req.json().catch(() => ({}));
  const playbook = typeof body.editingPlaybook === "string" ? body.editingPlaybook : "";
  await setEditingPlaybook(guard.userId, playbook);
  return NextResponse.json({ ok: true });
}
