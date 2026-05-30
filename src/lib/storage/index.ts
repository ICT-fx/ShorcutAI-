import { config } from "@/lib/config";
import { LocalStorageAdapter } from "./local";
import { R2StorageAdapter } from "./r2";
import { SupabaseStorageAdapter } from "./supabase";
import type { StorageAdapter } from "./types";

export type { StorageAdapter } from "./types";

let instance: StorageAdapter | null = null;

/** Returns the configured storage adapter (singleton). */
export function getStorage(): StorageAdapter {
  if (instance) return instance;
  switch (config.storage.driver) {
    case "supabase":
      instance = new SupabaseStorageAdapter();
      break;
    case "r2":
      instance = new R2StorageAdapter();
      break;
    default:
      instance = new LocalStorageAdapter();
  }
  return instance;
}
