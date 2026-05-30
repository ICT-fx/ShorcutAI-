/**
 * Route-handler auth guards. Returns an early `error` Response when the request
 * isn't allowed, otherwise the scoping `userId` (null when auth is disabled).
 */
import { NextResponse } from "next/server";
import { isAuthorized, ownsProject } from "@/lib/auth";

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function requireAuth(): Promise<{ error?: NextResponse; userId: string | null }> {
  const { ok, userId } = await isAuthorized();
  if (!ok) return { error: unauthorized(), userId: null };
  return { userId };
}

/** Auth + ownership of a specific project in one call. */
export async function requireProject(
  projectId: string,
): Promise<{ error?: NextResponse; userId: string | null }> {
  const { ok, userId } = await isAuthorized();
  if (!ok) return { error: unauthorized(), userId };
  if (!(await ownsProject(projectId, userId))) return { error: notFound(), userId };
  return { userId };
}
