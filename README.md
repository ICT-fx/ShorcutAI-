# Shortcut.Edit

Turn **rushes + script + preferences** into an **auto-edited MP4**, rendered with
[Remotion](https://www.remotion.dev/). The intelligent part isn't the rendering
(Remotion handles that) — it's the **editorial decision layer** that converts
your inputs into a validated **EDL** (Edit Decision List) that Remotion renders.

- 💸 **Cheapest path by default.** Everything runs free/self-hosted out of the box; every paid service is opt-in behind an env flag.
- 🧾 **The EDL is the contract.** A Zod-validated JSON document is the single interface between the editor (rules *or* LLM) and Remotion. No editing logic lives in the Remotion components.
- 🧱 **Deterministic first, AI second.** The app produces a correct video with zero AI; the LLM only enriches/reorders and always falls back to the deterministic editor.
- 👀 **Preview before render.** The `<Player>` previews the exact composition the renderer uses — for free. Rendering is the only costly step.
- ⏱️ **Long jobs are async.** Transcription and rendering go through a BullMQ queue (with an in-process fallback when Redis isn't running).

> See [`RAPPORT.md`](./RAPPORT.md) for the full architecture write-up, the decisions taken, and the cost breakdown.

---

## Quick start (the free path)

Requirements: **Node ≥ 20** (tested on 24). Nothing else is required for the
deterministic pipeline — media probing and rendering use Remotion's bundled
tooling (no system ffmpeg needed).

```bash
# 1. Install + set up the database
npm install
cp .env.example .env          # defaults are all free / self-hosted
npm run db:push               # creates the SQLite db (prisma/dev.db)

# 2. Run the app
npm run dev                   # http://localhost:3000
```

Open http://localhost:3000 → **New project** → upload a video rush → (optionally
paste a script and tweak preferences) → **Generate edit** → preview → **Render MP4**.

That's the whole loop, with **no Redis, no ffmpeg, no API keys**. Renders run
in-process when Redis isn't available.

> **Two ways to run.** Out of the box it's **SQLite + local filesystem + no auth**
> (single-user local tool). Fill in the Supabase env vars and it switches to
> **Postgres + Supabase Storage + multi-user auth** — see
> [Supabase (Postgres + Storage + Auth)](#supabase-postgres--storage--auth) below.
> The code path is identical; only the adapters/config change.

### Smoke test (no UI)

```bash
npm run remotion:render:test   # renders a code-only test card to out/test.mp4
```

---

## Optional services (turn on what you need)

### Background workers (recommended beyond a quick demo)

Renders are CPU-heavy. To take them out of the web process, run Redis + the worker:

```bash
brew install redis && redis-server          # or: docker run -p 6379:6379 redis
npm run worker                               # processes render + transcription jobs
```

The app auto-detects Redis. If it's reachable, jobs go through BullMQ; if not,
they run inline in the web process (fine for local use).

### Transcription (word-synced captions)

Free, self-hosted via faster-whisper:

```bash
cd services/transcription
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py                                # serves on :8001
```

Then click **Transcribe rushes** in the UI and re-generate the edit. See
[`services/transcription/README.md`](./services/transcription/README.md) — note
the Python-version caveat for faster-whisper wheels.

Paid fallback: set `GROQ_API_KEY` in `.env` (~$0.04/audio-hour).

### AI editor (LLM-generated edits)

Set `ANTHROPIC_API_KEY` in `.env`. With a key present, **Generate edit** (Auto)
uses the LLM (default model `claude-haiku-4-5`, the economical tier) and falls
back to the deterministic editor on any failure. Without a key, Auto = deterministic.

The LLM receives **only text** (transcript + metadata + script) — never the video
pixels — and returns an editorial skeleton; captions are always injected
deterministically from the real transcript timings.

### ffmpeg (silence trimming)

`brew install ffmpeg` enables the "Remove silences" preference (trims dead air at
clip edges). Without ffmpeg it's a no-op and clips are kept whole.

---

## Supabase (Postgres + Storage + Auth)

Switches the app from the local single-user setup to a deployable, multi-user
SaaS. Set these in `.env` (all under the Supabase section of `.env.example`):

```bash
# Postgres — from Supabase: Connect → ORM → Prisma (use the pooler URLs)
DATABASE_URL="postgresql://postgres.<ref>:<pwd>@aws-<n>-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<ref>:<pwd>@aws-<n>-<region>.pooler.supabase.com:5432/postgres"
# API — Settings → API
NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<publishable / anon key>"
SUPABASE_SERVICE_ROLE_KEY="<service_role / secret key — SERVER ONLY>"
# Storage
STORAGE_DRIVER="supabase"
SUPABASE_BUCKET="media"
```

Then:

```bash
npm run db:push          # create tables in Supabase Postgres
# create a PUBLIC bucket named "media" (Storage → New bucket → Public)
npm run dev
```

- **DB:** `DATABASE_URL` = transaction pooler (6543, `pgbouncer=true`) for the app;
  `DIRECT_URL` = session pooler (5432) for migrations. (Switch `provider` is already
  `postgresql` in `prisma/schema.prisma`.)
- **Storage:** the `media` bucket must be **public** — the render Chrome and the
  browser `<Player>` fetch objects by URL. Uploads + rendered MP4s live there.
- **Auth:** when the Supabase env vars are present, auth turns **on** automatically
  (middleware protects pages; API routes return 401/404; projects are scoped to the
  signed-in user). Remove the vars and the app reverts to single-user local mode.
  Login supports **email + password**, **magic link**, and **Google**.

### Google OAuth (optional)

1. Google Cloud Console → create an OAuth Client (Web) with authorized redirect URI
   `https://<ref>.supabase.co/auth/v1/callback`.
2. Supabase → **Authentication → Providers → Google** → enable + paste Client ID/Secret.
3. Supabase → **Authentication → URL Configuration** → add your app redirect URLs
   (`http://localhost:3000/**`, and your production URL).

Email + magic link work with no extra configuration.

---

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run worker` | BullMQ worker (render + transcription) |
| `npm run db:push` / `db:studio` | Apply schema / open Prisma Studio |
| `npm run remotion:studio` | Open Remotion Studio on the compositions |
| `npm run remotion:render:test` | Render the code-only test card |
| `npm run typecheck` | `tsc --noEmit` |

---

## Architecture at a glance

```
Upload ─▶ Probe (media-parser) ─▶ [Transcribe] ─▶ Editorial layer ─▶ EDL (Zod-validated)
                                                   (rules OR LLM)         │
                                                                          ▼
                                            Compile ─▶ <Player> preview (free)
                                                   └─▶ renderMedia() ─▶ MP4 ─▶ StorageAdapter
```

- **EDL contract:** [`src/lib/edl/schema.ts`](./src/lib/edl/schema.ts) (+ `validate.ts`, `compile.ts`)
- **Editors:** [`src/lib/edl/deterministic.ts`](./src/lib/edl/deterministic.ts), [`src/lib/llm/editorial.ts`](./src/lib/llm/editorial.ts)
- **Remotion composition:** [`src/remotion/AutoEdit.tsx`](./src/remotion/AutoEdit.tsx)
- **Storage seam:** [`src/lib/storage/`](./src/lib/storage/) (local FS → Supabase Storage / R2 / B2)
- **Auth:** [`src/lib/supabase/`](./src/lib/supabase/) + [`src/middleware.ts`](./src/middleware.ts) (Supabase Auth, optional)
- **Jobs:** [`src/lib/jobs/`](./src/lib/jobs/) + [`src/workers/index.ts`](./src/workers/index.ts)

---

## ⚖️ Remotion license

Remotion is **free** for individuals and companies of **≤ 3 people** making
videos *for themselves*. The moment you serve rendered videos to **end users as
a commercial product**, you need *Remotion for Automators* ($0.01/render, min
$100/month). Put the key in `REMOTION_LICENSE_KEY` (empty by default — never
hardcode it). See https://www.remotion.dev/license.
