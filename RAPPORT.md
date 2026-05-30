# RAPPORT — Outil web d'automatisation de montage vidéo (Remotion)

> Construit en autonomie d'après le brief. Toutes les phases (0 → 5) ont été
> enchaînées. La chaîne déterministe complète (upload → probe → EDL → preview →
> rendu MP4) a été **vérifiée de bout en bout** sur la machine de dev.

---

## 1. Ce qui a été construit

Une application **Next.js (App Router) + TypeScript** mono-repo qui transforme
`rushs + images + script + préférences` en un **MP4 monté automatiquement**,
rendu par **Remotion**. Le cœur du système est l'**EDL** (Edit Decision List),
un JSON validé par **Zod** qui sert de contrat unique entre la couche éditoriale
(règles déterministes *ou* LLM) et les composants Remotion. Aucun montage n'est
codé en dur dans Remotion : `<AutoEdit>` rend *n'importe quelle* EDL valide.

### Pipeline réel

```
Upload ─▶ Probe (@remotion/media-parser, JS pur — pas de ffmpeg)
       ─▶ [Transcription faster-whisper | Groq]  (optionnel, async)
       ─▶ Couche éditoriale : déterministe  OU  LLM (Anthropic Haiku)
       ─▶ EDL  ── validée Zod + cohérence média (garde-fou anti-hallucination)
       ─▶ Compilation timeline (frames absolus, EDL → props Remotion)
       ─▶ <Player> (preview navigateur, GRATUIT)   ┐ mêmes props exactes
       ─▶ renderMedia() (job BullMQ ou inline) ─────┘ ─▶ MP4 ─▶ StorageAdapter
```

### Arborescence (fichiers clés)

```
prisma/schema.prisma            Modèles SQLite (Project, MediaAsset, Transcript, Job)
remotion.config.ts              Config CLI/Studio (h264, jpeg)
.env.example                    Tout le free/self-host par défaut, payant = opt-in

src/lib/
  config.ts                     Accès env validé (défauts = chemin gratuit)
  types.ts                      MediaInfo, TranscriptResult, EditPreferences (Zod)
  edl/
    schema.ts        ★          LE CONTRAT EDL : schéma + types Zod
    validate.ts      ★          Garde-fou : EDL vs médias réels (bornes, ids)
    compile.ts                  EDL → props <AutoEdit> (frames absolus)
    captions.ts                 Sous-titres depuis transcript (partagé règles/LLM)
    deterministic.ts ★          Éditeur par règles (MVP + fallback)
    generate.ts                 Orchestrateur : choisit éditeur, valide, persiste
  llm/
    prompt.ts                   System prompt (caché) + user prompt
    editorial.ts     ★          LLM → squelette JSON + boucle de réparation
  media/
    probe.ts                    Durée/dim/fps via media-parser (sans ffmpeg)
    silence.ts                  silencedetect ffmpeg (optionnel, dégradé)
  transcription/                whisper.ts (self-host), groq.ts (fallback), job.ts (cache)
  storage/                      types.ts (interface) · local.ts · r2.ts (stub) · index.ts
  queue/                        connection.ts (probe Redis) · queues.ts (BullMQ)
  jobs/                         index.ts (enqueue + fallback inline) · processors.ts
  render/render.ts              bundle + renderMedia + stockage
  cost.ts                       Estimation coût par job (transcription/LLM/rendu)
  upload.ts                     Ingestion : hash, kind, probe, garde-fous taille/durée
  project.ts                    Helpers DB → MediaInfo, prefs, transcripts

src/remotion/                   index.ts, Root.tsx, TestCard.tsx, AutoEdit.tsx
  components/                   ClipSequence, TextOverlay, ImageOverlay, Captions,
                                TransitionWrapper, MusicTrack, position
src/app/                        layout, page (liste projets), projects/[id], api/*
src/components/                 Editor.tsx (UI principale), PlayerPreview.tsx
src/workers/index.ts            Worker BullMQ (render + transcription)
services/transcription/         Microservice Python FastAPI + faster-whisper
```

### État par phase

| Phase | Contenu | État |
| --- | --- | --- |
| 0 | Fondations + rendu MP4 de test | ✅ vérifié (out/test.mp4) |
| 1 | MVP déterministe : upload, formulaire, EDL par règles, preview, rendu | ✅ vérifié de bout en bout |
| 2 | Transcription faster-whisper + BullMQ + fallback Groq + cache | ✅ construit (service Python à lancer/clé Groq pour exercer) |
| 3 | LLM génère l'EDL + boucle validation/réparation + fallback déterministe | ✅ construit (clé Anthropic requise pour exercer) |
| 4 | Détection de silences, transitions, ducking musique, formats, file UI, erreurs | ✅ construit |
| 5 | Adaptateur R2/B2, log de coût, notes licence | ✅ (auth/quotas = TODO documenté) |

---

## 2. Décisions techniques prises (et pourquoi)

Toutes tranchées seule, en privilégiant systématiquement **le plus simple et le
moins cher**.

1. **Probe média via `@remotion/media-parser` (JS pur) plutôt que ffprobe.**
   ffmpeg/ffprobe n'étaient pas installés sur la machine. media-parser donne
   durée/résolution/fps/audio **sans dépendance native** → l'app marche « out of
   the box ». ffmpeg reste *optionnel*, uniquement pour la détection de silences.

2. **EDL = `type` (pas `interface`) + Zod, captions hors-LLM.** Le squelette
   produit par le LLM ne contient **pas** les sous-titres : ceux-ci sont injectés
   de façon déterministe depuis les timings réels du transcript. Le LLM ne peut
   pas inventer des timings frame-exacts de façon fiable, et ça réduit ses tokens
   de sortie (donc le coût). Le LLM ne reçoit **que du texte**, jamais les pixels.

3. **Modèle LLM = Claude Haiku 4.5 (économique), configurable.** Le brief demande
   « modèle économique type Haiku ». Choisi via `ANTHROPIC_MODEL`. Le system prompt
   (schéma + règles, stable) est **mis en cache** (`cache_control: ephemeral`) →
   ~0,1× le coût d'entrée sur les générations répétées. Pas de paramètre `effort`
   ni `thinking` pour rester compatible si on bascule sur un autre modèle.

4. **Boucle de réparation au lieu de « structured outputs » stricts.** Le schéma
   EDL a des contraintes (min/max, unions) que le JSON-schema strict de l'API ne
   supporte pas bien. Donc : prompt « JSON only » → parse → validation Zod +
   cohérence média → si échec, on renvoie l'erreur au LLM (N tentatives) → sinon
   **fallback déterministe**. L'app ne peut jamais échouer à produire une vidéo.

5. **Jobs async avec fallback inline.** BullMQ + Redis pour les jobs longs
   (transcription, rendu). **Mais** si Redis n'est pas joignable, `enqueue*` exécute
   le job **en cours de process** (détaché) — l'app reste 100 % fonctionnelle sur
   une machine nue, sans infra. (Vérifié : le rendu de démo a tourné en inline.)

6. **SQLite + Prisma, JSON stocké en `String`.** Zéro infra, zéro coût. JSON
   stringifié (portable SQLite). Migration Postgres = changer le `provider`.

7. **StorageAdapter (interface) + adaptateur local par défaut.** Le filesystem
   local sert les fichiers via une route Next `/api/media/[...key]` avec **support
   des Range HTTP** (indispensable pour le seek vidéo dans le `<Player>` *et* pour
   le Chrome de rendu). Adaptateur **R2/B2** prêt (`r2.ts`), avec `@aws-sdk/client-s3`
   en dépendance **optionnelle** (import dynamique) pour ne pas alourdir l'install.

8. **Rendu : URLs HTTP plutôt que `staticFile`.** La composition reçoit des URLs
   `http://localhost:3000/api/media/...` ; le Chrome de rendu les fetch comme le
   navigateur. Conséquence assumée : **le serveur Next doit tourner pendant un
   rendu** (documenté). Le même objet de props alimente preview et rendu → « ce
   qu'on prévisualise = ce qu'on rend ».

9. **Pas de Tailwind.** Un seul `globals.css` soigné → moins de dépendances de
   build, cohérent avec « le plus simple ».

10. **zod v3 (pas v4).** `@remotion/zod-types` (récent) exige zod v4 ; je ne
    l'utilise pas, donc je reste sur zod v3 (stable, API éprouvée) et j'ai retiré
    ce paquet.

---

## 3. Comment lancer le projet (de A à Z)

### Chemin gratuit (suffisant pour tout tester)

```bash
npm install
cp .env.example .env          # tous les défauts sont gratuits / self-host
npm run db:push               # crée prisma/dev.db
npm run dev                   # http://localhost:3000
```

UI : **New project** → uploader un rush vidéo → (script + préférences) →
**Generate edit** → preview → **Render MP4** → télécharger. Aucun Redis, ffmpeg
ni clé API requis. (Le rendu tourne en inline si Redis est absent.)

Test sans UI : `npm run remotion:render:test` → `out/test.mp4`.

### Services optionnels

- **Workers (recommandé au-delà d'une démo)** : `brew install redis && redis-server`
  puis `npm run worker`. L'app détecte Redis automatiquement.
- **Transcription gratuite** : voir `services/transcription/README.md`
  (`python app.py` sur :8001), puis bouton **Transcribe rushes**.
  Fallback payant : `GROQ_API_KEY`.
- **Éditeur IA** : `ANTHROPIC_API_KEY` dans `.env` → « Generate edit » (Auto)
  passe par le LLM, avec repli déterministe.
- **Suppression des silences** : `brew install ffmpeg` active la préférence
  « Remove silences ».

---

## 4. Coûts — gratuit vs payant

| Composant | Gratuit (défaut) | Devient payant… | Ordre de grandeur |
| --- | --- | --- | --- |
| Web / DB / stockage | Next + SQLite + FS local | jamais (en local) ; R2/B2 si volume | R2/B2 : egress gratuit, ~0,015 $/Go stockés |
| **Probe média** | media-parser (JS pur) | jamais | 0 $ |
| **Transcription** | faster-whisper self-host | Groq si activé | Groq ≈ **0,04 $/heure** audio |
| **Éditeur** | déterministe (règles) | LLM si clé fournie | Haiku ≈ **1 $/Mtok in, 5 $/Mtok out** ; un edit ≈ quelques k tokens ⇒ ~0,001–0,005 $ |
| **Rendu Remotion** | self-host (CPU local) | *Remotion for Automators* si usage commercial | **0,01 $/rendu**, **min 100 $/mois** |
| File de jobs | inline (sans Redis) | — | 0 $ |

- **Leviers coût implémentés** : caches transcript par **hash de contenu** (un
  rush ré-uploadé n'est jamais re-transcrit) ; system prompt LLM **mis en cache** ;
  LLM nourri **texte seulement** ; **coût estimé loggé par job** (`src/lib/cost.ts`,
  champ `costJson`) ; garde-fous `MAX_UPLOAD_MB` / `MAX_CLIP_SECONDS` /
  `MAX_RENDER_SECONDS`.
- **Seuil licence Remotion** : tant que tu fais des vidéos *pour toi* (≤ 3 pers.),
  c'est gratuit. Dès que des **utilisateurs finaux** reçoivent les vidéos rendues
  (produit commercial) → licence Automators (0,01 $/rendu, min 100 $/mois).
  `REMOTION_LICENSE_KEY` est vide par défaut, jamais codé en dur.

---

## 5. Vérifications effectuées

- ✅ `tsc --noEmit` propre ; `next build` réussi (13 routes).
- ✅ Rendu de test Phase 0 (`out/test.mp4`).
- ✅ **Bout en bout** (serveur réel, via API) : création projet → upload du rush →
  probe (durée 3,05 s détectée sans ffmpeg) → EDL déterministe (1 clip, 2
  sous-titres issus du script, validation OK) → **rendu inline** → MP4 653 Ko,
  **1920×1080 / 3,1 s / 30 fps**, coût loggé (0 $, self-host).
- ✅ Route média : **HTTP 206 Partial Content** (Range) confirmé.

Non exercé à l'exécution (mais construit, typé, et buildé) : le **LLM** (nécessite
une clé Anthropic) et la **transcription** (nécessite le service Python ou une clé
Groq). Le chemin de fallback sous-titres-depuis-script a, lui, été exercé.

---

## 6. Limites connues & TODO

- **Transitions sans cross-dissolve réel.** Les clips sont placés bout à bout (math
  timeline exacte) ; « fade/slide » est une animation d'**entrée** du clip suivant.
  Le vrai cross-dissolve (chevauchement) viendrait via `@remotion/transitions`.
- **Ducking musique approximé.** Le volume de la musique baisse quand un sous-titre
  est actif (proxy de la voix). Un vrai sidechain demanderait une analyse audio.
- **Détection de scènes (PySceneDetect) non implémentée.** Seule la détection de
  silences (ffmpeg) l'est, et appliquée au rognage des bords de clip uniquement.
- **Faster-whisper & Python 3.14.** Les wheels `ctranslate2`/`onnxruntime` peuvent
  manquer sur Python 3.14 → utiliser un venv en **3.11/3.12** (cf. README service).
  N'affecte pas l'app Node ; fallback : sous-titres depuis script, ou Groq.
- **Rendu = serveur Next requis.** Le Chrome de rendu fetch les médias via
  `APP_BASE_URL`. En prod multi-machine, faire pointer le worker vers une URL
  joignable (ou copier les médias dans le `publicDir` Remotion).
- **Uploads en un seul POST.** OK en local ; pour de très gros fichiers, prévoir
  un upload chunké / pré-signé (surtout avec R2).
- **Auth + multi-tenant : FAIT** via Supabase (voir §8). Les **quotas** de coût
  restent globaux (par app), pas encore par-utilisateur.
- **R2 non testé à l'exécution** (stub fonctionnel ; nécessite `npm i
  @aws-sdk/client-s3` + identifiants). L'adaptateur **Supabase Storage**, lui, est
  testé en vrai.

### Prochaines améliorations recommandées
1. `@remotion/transitions` pour de vraies transitions.
2. Détection de plans (PySceneDetect) pour découper intelligemment les longs rushs.
3. SSE/websocket pour la progression des jobs (au lieu du polling).
4. Quotas par utilisateur (l'auth multi-tenant Supabase est déjà faite — cf. §8).
5. Upload pré-signé direct vers R2 / Supabase pour les gros fichiers.

---

## 7. Points nécessitant ton attention (décisions tranchées seul)

1. **Stack de probe** : j'ai remplacé ffprobe par `@remotion/media-parser` pour
   éviter une dépendance native. Si tu veux du ffprobe « canonique », c'est un
   adaptateur à ajouter dans `src/lib/media/probe.ts`.
2. **Modèle LLM** : Haiku 4.5 par défaut (économique). À ajuster via
   `ANTHROPIC_MODEL` si tu veux plus de qualité éditoriale (Sonnet/Opus = plus cher).
3. **Sous-titres générés hors-LLM** : choix délibéré (précision + coût). Si tu
   veux que le LLM décide aussi du phrasé des sous-titres, il faudra rouvrir ce point.
4. **Fallback inline des jobs** : pratique en local mais le rendu tourne alors
   dans le process web. En production, **lance toujours le worker** (Redis).
5. **`as any` sur la connexion BullMQ** : BullMQ embarque sa propre copie d'ioredis
   (conflit de types nominal, pas de souci runtime). Documenté dans le code.
6. **Licence Remotion** : à trancher selon ton modèle d'usage (perso vs commercial).
   Rien n'est codé en dur ; la clé passe par `.env`.
7. **Chemin du projet avec espaces** (`/SAAS /VIDEO AUTO SAAS`) : géré (quoting),
   mais c'est une source classique d'ennuis avec certains outils — à garder en tête.

---

## 8. Mise à jour — Intégration Supabase (DB + Storage + Auth)

Après le build initial, le projet a été migré de SQLite/FS-local/sans-auth vers
**Supabase** (Postgres + Storage + Auth). **Vérifié de bout en bout** (DB, upload
bucket, rendu MP4 stocké dans Supabase, et login navigateur réel).

### Ce qui a changé
- **Base de données** : `prisma/schema.prisma` passé en `provider = "postgresql"`
  + `directUrl`. Connexion via le **connection pooler** Supabase
  (`aws-1-eu-central-1.pooler.supabase.com`) : `DATABASE_URL` = transaction pooler
  (6543, `pgbouncer=true`) pour l'app, `DIRECT_URL` = session pooler (5432) pour les
  migrations. Tables créées via `prisma db push`.
- **Stockage** : nouvel adaptateur `src/lib/storage/supabase.ts`
  (`STORAGE_DRIVER=supabase`), bucket public `media`. Upload, probe (download tmp),
  rendu et livraison passent par Supabase Storage.
- **Auth** : `@supabase/ssr` — `src/lib/supabase/{server,client,middleware}.ts`,
  `src/middleware.ts`, pages `src/app/login` + `src/app/auth/{callback,signout}`.
  Login **email/mot de passe + magic link + Google OAuth**. Champ `Project.userId`
  ajouté ; **toutes les routes API sont scopées par utilisateur** (401 si non
  connecté, 404 si non-propriétaire) via `src/lib/api-auth.ts`.
- **Dégradé propre** : si les variables Supabase sont absentes, l'auth se
  **désactive** et l'app retombe en mono-utilisateur + SQLite/FS-local. Rien ne casse.

### Décisions (Supabase)
- **Connexion directe abandonnée au profit du pooler** : le endpoint
  `db.<ref>.supabase.co:5432` était instable (auth refusée puis connexion refusée).
  Le pooler (IPv4) est fiable ; host réel = `aws-1-…` (pas `aws-0-…`).
- **Clé publishable** (`sb_publishable_…`) utilisée côté client (validé : login OK),
  **service_role** côté serveur (Storage admin).
- **Autorisation au niveau applicatif, pas RLS** : Prisma se connecte avec un rôle
  privilégié qui **bypass la RLS** ; le filtrage par `userId` est donc fait dans le
  code (et nos tables ne sont pas exposées via la Data API, donc la clé anon ne peut
  pas les atteindre). RLS = défense en profondeur à ajouter si on expose la Data API.
- **Bucket public** : nécessaire pour que le Chrome de rendu + le `<Player>` lisent
  les médias par URL. Donc **les URLs médias/rendus sont publiques** (devinables
  difficilement, mais publiques). Bucket privé + URLs signées = amélioration future
  (l'interface `publicUrl` synchrone devrait devenir async).

### À faire côté toi
- **Google OAuth** : activer le provider dans Supabase (Authentication → Providers →
  Google) avec un Client ID/Secret Google Cloud (redirect `…supabase.co/auth/v1/callback`)
  + ajouter les redirect URLs de l'app. Email + magic link marchent déjà.
- **Rotater les secrets** (service_role / secret / mot de passe DB) ayant transité
  par le chat.
- **Déploiement** : `DATABASE_URL` pointe déjà sur le transaction pooler (compatible
  serverless/Vercel). Lancer le worker Redis pour sortir les rendus du process web.
