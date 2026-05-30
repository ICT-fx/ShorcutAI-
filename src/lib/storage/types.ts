/**
 * StorageAdapter — the seam that lets us run on the local filesystem for free
 * and switch to Cloudflare R2 / Backblaze B2 (egress-free) without touching any
 * caller. Keys are opaque strings; callers never assume a path layout.
 */
import type { Readable } from "node:stream";

export interface PutOptions {
  contentType?: string;
}

export interface StorageAdapter {
  readonly driver: string;

  /** Persist bytes under `key`. Returns the key. */
  put(key: string, data: Buffer | Uint8Array, opts?: PutOptions): Promise<string>;

  /** Persist a stream under `key` (used for large uploads / renders). */
  putStream(key: string, stream: Readable, opts?: PutOptions): Promise<string>;

  /** Read bytes back (used by ffprobe/transcription/render). */
  get(key: string): Promise<Buffer>;

  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;

  /**
   * An HTTP(S) URL the browser <Player> and the render Chrome can both fetch.
   * For local storage this points at the Next /api/media route.
   */
  publicUrl(key: string): string;

  /**
   * An absolute local filesystem path when one exists (local driver only).
   * Tools like ffprobe prefer a real path; returns null for remote drivers,
   * in which case callers fall back to downloading via get().
   */
  localPath(key: string): string | null;
}
