import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { config } from "@/lib/config";
import type { PutOptions, StorageAdapter } from "./types";

/**
 * Local filesystem adapter. Keys map 1:1 to relative paths under the storage
 * root. URLs are served by the Next /api/media/[...key] route so that the
 * render Chrome can fetch them over HTTP exactly like the browser preview.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly driver = "local";
  private root: string;

  constructor(root = config.storage.localRoot) {
    this.root = path.resolve(process.cwd(), root);
  }

  private resolve(key: string): string {
    // Prevent path traversal out of the storage root.
    const safe = path
      .normalize(key)
      .replace(/^(\.\.(\/|\\|$))+/, "")
      .replace(/^[/\\]+/, "");
    return path.join(this.root, safe);
  }

  async put(key: string, data: Buffer | Uint8Array): Promise<string> {
    const dest = this.resolve(key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, data);
    return key;
  }

  async putStream(key: string, stream: Readable, _opts?: PutOptions): Promise<string> {
    const dest = this.resolve(key);
    await mkdir(path.dirname(dest), { recursive: true });
    await pipeline(stream, createWriteStream(dest));
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  publicUrl(key: string): string {
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    return `${config.appBaseUrl.replace(/\/$/, "")}/api/media/${encoded}`;
  }

  localPath(key: string): string {
    return this.resolve(key);
  }
}
