/**
 * Server-side auth helpers. Authorization for app tables is enforced HERE (app
 * layer), because Prisma connects with a privileged Postgres role that bypasses
 * RLS — every query is scoped by the current user's id. (Our tables are not
 * exposed via the Supabase Data API, so the anon key can't reach them directly.)
 */
import type { User } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase/middleware";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Current authenticated user, or null. Validated against Supabase (getUser). */
export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns the user id to scope DB rows by. When auth is OFF (no Supabase),
 * returns null and the app behaves as a single-user local tool.
 */
export async function getScopeUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

/** Whether `userId` may access the given project (or null userId = auth off). */
export async function ownsProject(projectId: string, userId: string | null): Promise<boolean> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!p) return false;
  if (userId === null) return true; // auth disabled → single-user mode
  return p.userId === userId;
}

/** True if the request is authorized: auth disabled, OR a user is present. */
export async function isAuthorized(): Promise<{ ok: boolean; userId: string | null }> {
  if (!isSupabaseConfigured()) return { ok: true, userId: null };
  const userId = await getScopeUserId();
  return { ok: userId !== null, userId };
}
