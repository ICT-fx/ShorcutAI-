/**
 * Centralised, validated environment access. Import `config` everywhere instead
 * of reading process.env directly. Defaults always point at the free path.
 */
import "dotenv/config";

function str(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}
function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function list(key: string, fallback: string[]): string[] {
  const v = process.env[key];
  if (!v) return fallback;
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  appBaseUrl: str("APP_BASE_URL", "http://localhost:3000"),
  databaseUrl: str("DATABASE_URL", "file:./dev.db"),

  storage: {
    driver: str("STORAGE_DRIVER", "local") as "local" | "r2" | "supabase",
    localRoot: str("STORAGE_LOCAL_ROOT", "./storage"),
    s3: {
      endpoint: str("S3_ENDPOINT"),
      region: str("S3_REGION", "auto"),
      bucket: str("S3_BUCKET"),
      accessKeyId: str("S3_ACCESS_KEY_ID"),
      secretAccessKey: str("S3_SECRET_ACCESS_KEY"),
      publicBaseUrl: str("S3_PUBLIC_BASE_URL"),
    },
  },

  // Supabase (Postgres via Prisma, Storage, and Auth). Server reads these; the
  // NEXT_PUBLIC_* ones are also sent to the browser for the auth client.
  supabase: {
    url: str("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: str("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: str("SUPABASE_SERVICE_ROLE_KEY"),
    bucket: str("SUPABASE_BUCKET", "media"),
    get configured() {
      return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    },
  },

  redisUrl: str("REDIS_URL", "redis://127.0.0.1:6379"),

  transcription: {
    providers: list("TRANSCRIBE_PROVIDERS", ["faster-whisper", "groq"]),
    whisperServiceUrl: str("WHISPER_SERVICE_URL", "http://127.0.0.1:8001"),
    groqApiKey: str("GROQ_API_KEY"),
    groqModel: str("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo"),
  },

  llm: {
    anthropicApiKey: str("ANTHROPIC_API_KEY"),
    model: str("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"),
    maxRepairAttempts: num("LLM_MAX_REPAIR_ATTEMPTS", 2),
    get enabled() {
      return Boolean(process.env.ANTHROPIC_API_KEY);
    },
  },

  remotion: {
    licenseKey: str("REMOTION_LICENSE_KEY"),
  },

  limits: {
    maxUploadMb: num("MAX_UPLOAD_MB", 500),
    maxClipSeconds: num("MAX_CLIP_SECONDS", 1800),
    maxRenderSeconds: num("MAX_RENDER_SECONDS", 600),
  },
} as const;

export type AppConfig = typeof config;
