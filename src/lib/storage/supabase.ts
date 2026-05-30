import type { Readable } from "node:stream";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";
import type { PutOptions, StorageAdapter } from "./types";

/**
 * Supabase Storage adapter. Uploads/serves media + rendered MP4s from a Supabase
 * bucket — the right choice for a deployed SaaS (the local FS doesn't persist on
 * serverless hosts like Vercel).
 *
 * Uses the service-role key (server-only) for full read/write. `publicUrl()`
 * returns the object's public URL, so the bucket must be PUBLIC for the render
 * Chrome + the browser <Player> to fetch media. (Private bucket + signed URLs is
 * a documented upgrade — it needs an async URL resolver, which the sync
 * StorageAdapter.publicUrl contract doesn't allow today.)
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  readonly driver = "supabase";
  private clientInstance: SupabaseClient | null = null;
  private bucket = config.supabase.bucket;

  private client(): SupabaseClient {
    if (!this.clientInstance) {
      if (!config.supabase.url || !config.supabase.serviceRoleKey) {
        throw new Error(
          "STORAGE_DRIVER=supabase requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        );
      }
      this.clientInstance = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
        auth: { persistSession: false },
      });
    }
    return this.clientInstance;
  }

  async put(key: string, data: Buffer | Uint8Array, opts?: PutOptions): Promise<string> {
    const { error } = await this.client()
      .storage.from(this.bucket)
      .upload(key, data, { contentType: opts?.contentType, upsert: true });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return key;
  }

  async putStream(key: string, stream: Readable, opts?: PutOptions): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return this.put(key, Buffer.concat(chunks), opts);
  }

  async get(key: string): Promise<Buffer> {
    const { data, error } = await this.client().storage.from(this.bucket).download(key);
    if (error || !data) throw new Error(`Supabase download failed: ${error?.message ?? "no data"}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async exists(key: string): Promise<boolean> {
    const { error } = await this.client().storage.from(this.bucket).createSignedUrl(key, 60);
    return !error;
  }

  async remove(key: string): Promise<void> {
    await this.client().storage.from(this.bucket).remove([key]);
  }

  publicUrl(key: string): string {
    return this.client().storage.from(this.bucket).getPublicUrl(key).data.publicUrl;
  }

  localPath(): null {
    return null; // remote — callers download via get()
  }
}
