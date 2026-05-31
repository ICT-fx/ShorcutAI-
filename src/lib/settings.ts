/**
 * Per-user app settings — currently the "editing playbook": the user's standing
 * montage doctrine (how to cut, what to keep/drop, tone) injected into the LLM
 * prompt on every generation. Keyed by the Supabase auth user id, or a fixed
 * local key when auth is disabled (single-user mode).
 */
import { prisma } from "@/lib/db";

const LOCAL_KEY = "__local__";
const MAX_PLAYBOOK_CHARS = 8000;

export function settingsKey(userId: string | null): string {
  return userId ?? LOCAL_KEY;
}

export interface UserSettingsData {
  editingPlaybook: string;
}

export async function getUserSettings(userId: string | null): Promise<UserSettingsData> {
  const row = await prisma.userSettings.findUnique({ where: { userId: settingsKey(userId) } });
  return { editingPlaybook: row?.editingPlaybook ?? "" };
}

export async function setEditingPlaybook(userId: string | null, playbook: string): Promise<void> {
  const editingPlaybook = playbook.slice(0, MAX_PLAYBOOK_CHARS);
  const key = settingsKey(userId);
  await prisma.userSettings.upsert({
    where: { userId: key },
    update: { editingPlaybook },
    create: { userId: key, editingPlaybook },
  });
}
