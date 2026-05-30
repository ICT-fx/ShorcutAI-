import type { Readable } from "node:stream";
import { config } from "@/lib/config";
import type { PutOptions, StorageAdapter } from "./types";

/**
 * S3-compatible adapter for Cloudflare R2 / Backblaze B2 (both have free egress,
 * the key cost lever once you scale past local disk).
 *
 * The AWS SDK is an OPTIONAL dependency — we keep the default install lean.
 * Switch STORAGE_DRIVER=r2 and run:  npm i @aws-sdk/client-s3
 */
export class R2StorageAdapter implements StorageAdapter {
  readonly driver = "r2";
  // Lazily-initialised S3 client so the SDK is only required when actually used.
  private clientPromise: Promise<any> | null = null;

  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        let mod: any;
        try {
          // Specifier kept in a variable so TS/webpack don't statically resolve
          // this optional dependency at build time.
          const specifier = "@aws-sdk/client-s3";
          mod = await import(/* webpackIgnore: true */ specifier);
        } catch {
          throw new Error(
            "STORAGE_DRIVER=r2 requires the AWS SDK. Run: npm i @aws-sdk/client-s3",
          );
        }
        const { S3Client } = mod;
        const s3 = config.storage.s3;
        return {
          mod,
          client: new S3Client({
            region: s3.region,
            endpoint: s3.endpoint,
            credentials: {
              accessKeyId: s3.accessKeyId,
              secretAccessKey: s3.secretAccessKey,
            },
          }),
        };
      })();
    }
    return this.clientPromise;
  }

  async put(key: string, data: Buffer | Uint8Array, opts?: PutOptions): Promise<string> {
    const { mod, client } = await this.client();
    await client.send(
      new mod.PutObjectCommand({
        Bucket: config.storage.s3.bucket,
        Key: key,
        Body: data,
        ContentType: opts?.contentType,
      }),
    );
    return key;
  }

  async putStream(key: string, stream: Readable, opts?: PutOptions): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return this.put(key, Buffer.concat(chunks), opts);
  }

  async get(key: string): Promise<Buffer> {
    const { mod, client } = await this.client();
    const res = await client.send(
      new mod.GetObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as Readable) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async exists(key: string): Promise<boolean> {
    const { mod, client } = await this.client();
    try {
      await client.send(
        new mod.HeadObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    const { mod, client } = await this.client();
    await client.send(
      new mod.DeleteObjectCommand({ Bucket: config.storage.s3.bucket, Key: key }),
    );
  }

  publicUrl(key: string): string {
    const base = config.storage.s3.publicBaseUrl.replace(/\/$/, "");
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    return `${base}/${encoded}`;
  }

  localPath(): null {
    return null; // remote — callers must download via get()
  }
}
