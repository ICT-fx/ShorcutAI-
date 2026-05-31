"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PlayerPreview } from "./PlayerPreview";
import type { AutoEditProps } from "@/lib/edl/compile";
import { TITLE_STYLES, TITLE_STYLE_KEYS } from "@/lib/edl/titleStyles";
import {
  CSS_FONT_FAMILY,
  OVERLAY_TEMPLATES,
  OVERLAY_TEMPLATE_KEYS,
  type OverlayTemplate,
} from "@/lib/edl/overlayTemplates";
import type { EditPreferences } from "@/lib/types";

/** CSS for a template's sample text in the editor preview chip (stroke scaled
 * down for the small size). */
function overlayChipTextStyle(t: OverlayTemplate): React.CSSProperties {
  return {
    fontFamily: CSS_FONT_FAMILY[t.fontKey] ?? "sans-serif",
    fontWeight: t.fontWeight,
    fontSize: 20,
    lineHeight: 1.1,
    color: t.color,
    background: t.background ?? "transparent",
    textTransform: t.uppercase ? "uppercase" : "none",
    letterSpacing: t.letterSpacing,
    textShadow: t.shadow,
    borderRadius: t.background ? 8 : 0,
    padding: t.background ? "5px 9px" : "0",
    WebkitTextStroke: t.strokeColor ? `${Math.max(1, t.strokeWidthPx / 3)}px ${t.strokeColor}` : undefined,
    paintOrder: "stroke",
  } as React.CSSProperties;
}

/**
 * Caption-font choices shown as live previews — each chip is rendered in the
 * actual webfont (loaded via the Google Fonts <link> in layout.tsx) so the user
 * sees the look before generating. `key` matches EditPreferences.captionFont.
 */
const CAPTION_FONTS: { key: EditPreferences["captionFont"]; label: string; css: string }[] = [
  { key: "montserrat", label: "Montserrat", css: "'Montserrat', sans-serif" },
  { key: "poppins", label: "Poppins", css: "'Poppins', sans-serif" },
  { key: "oswald", label: "Oswald", css: "'Oswald', sans-serif" },
  { key: "bebasneue", label: "Bebas Neue", css: "'Bebas Neue', sans-serif" },
  { key: "anton", label: "Anton", css: "'Anton', sans-serif" },
];

interface MediaRow {
  id: string;
  kind: "video" | "image" | "audio";
  originalName: string;
  durationSec: number | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}
interface JobRow {
  id: string;
  type: string;
  status: string;
  progress: number;
}

async function jget(url: string) {
  const r = await fetch(url);
  return r.json();
}
async function jsend(url: string, method: string, body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

function fmtSize(b: number) {
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${(b / 1024).toFixed(0)}KB`;
}

export function Editor({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [prefs, setPrefs] = useState<EditPreferences | null>(null);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);

  const [props, setProps] = useState<AutoEditProps | null>(null);
  const [meta, setMeta] = useState({ fps: 30, durationInFrames: 1, width: 1080, height: 1920 });
  const [edlSource, setEdlSource] = useState<string | null>(null);
  const [validation, setValidation] = useState<{ errors: string[]; warnings: string[] } | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function reload() {
    const data = await jget(`/api/projects/${projectId}`);
    if (!data.project) return;
    setTitle(data.project.title);
    setScript(data.project.script);
    setPrefs(data.preferences);
    setMedia(data.project.media ?? []);
    setJobs(data.project.jobs ?? []);
  }

  async function loadCompiled() {
    const data = await jget(`/api/projects/${projectId}/compiled`);
    if (data.props) {
      setProps(data.props);
      setMeta({ fps: data.fps, durationInFrames: data.durationInFrames, width: data.width, height: data.height });
      setEdlSource(data.source);
    }
  }

  useEffect(() => {
    (async () => {
      await reload();
      await loadCompiled();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function up<K extends keyof EditPreferences>(key: K, value: EditPreferences[K]) {
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
  }

  async function savePrefs() {
    if (!prefs) return;
    await jsend(`/api/projects/${projectId}`, "PATCH", { title, script, preferences: prefs });
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy("upload");
    setMessage(null);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const r = await fetch(`/api/projects/${projectId}/media`, { method: "POST", body: fd });
    const data = await r.json();
    if (data.errors?.length) setMessage(`Problèmes d'upload : ${data.errors.join("; ")}`);
    await reload();
    setBusy(null);
  }

  async function deleteAsset(id: string) {
    await jsend(`/api/assets/${id}`, "DELETE");
    await reload();
  }

  async function waitForJob(jobId: string, onProgress?: (p: number) => void): Promise<JobRow & { result?: any; error?: string }> {
    for (let i = 0; i < 2000; i++) {
      const job = await jget(`/api/jobs/${jobId}`);
      onProgress?.(job.progress ?? 0);
      if (job.status === "completed" || job.status === "failed") return job;
      await new Promise((r) => setTimeout(r, 1200));
    }
    return { id: jobId, type: "", status: "failed", progress: 0, error: "Timed out" };
  }

  async function transcribe() {
    setBusy("transcribe");
    setMessage(null);
    const data = await jsend(`/api/projects/${projectId}/transcribe`, "POST");
    if (data.error) {
      setMessage(data.error);
      setBusy(null);
      return;
    }
    for (const j of data.jobs ?? []) {
      const done = await waitForJob(j.jobId);
      if (done.status === "failed") setMessage(`Échec de la transcription : ${done.error}`);
    }
    setMessage(`Transcription terminée${data.alreadyCached ? ` (${data.alreadyCached} en cache)` : ""}. Régénère le montage pour des sous-titres calés au mot.`);
    await reload();
    setBusy(null);
  }

  async function generate(mode: string) {
    setBusy("generate");
    setMessage(null);
    setValidation(null);
    await savePrefs();
    const data = await jsend(`/api/projects/${projectId}/edl`, "POST", { mode });
    if (data.error) {
      setMessage(`Échec de la génération : ${data.error}`);
      setBusy(null);
      return;
    }
    setProps(data.props);
    setMeta({ fps: data.fps, durationInFrames: data.durationInFrames, width: data.width, height: data.height });
    setEdlSource(data.source);
    setValidation(data.validation);
    setRenderUrl(null);
    setBusy(null);
  }

  async function render() {
    setBusy("render");
    setMessage(null);
    setRenderUrl(null);
    setRenderProgress(0);
    const data = await jsend(`/api/projects/${projectId}/render`, "POST");
    if (data.error) {
      setMessage(`Échec du rendu : ${data.error}`);
      setBusy(null);
      setRenderProgress(null);
      return;
    }
    const done = await waitForJob(data.jobId, (p) => setRenderProgress(p));
    if (done.status === "completed" && done.result?.url) {
      setRenderUrl(done.result.url);
      setMessage(`Rendu terminé : ${(done.result.bytes / 1024 / 1024).toFixed(1)} Mo.`);
    } else {
      setMessage(`Échec du rendu : ${done.error ?? "erreur inconnue"}`);
    }
    setRenderProgress(null);
    await reload();
    setBusy(null);
  }

  if (loading || !prefs) {
    return (
      <div className="container">
        <p className="muted">Loading project…</p>
      </div>
    );
  }

  const videos = media.filter((m) => m.kind === "video");
  const audios = media.filter((m) => m.kind === "audio");
  const canGenerate = videos.length > 0;

  return (
    <div className="container">
      <div className="row spread" style={{ marginBottom: 18 }}>
        <Link href="/" className="small muted">← Tous les projets</Link>
        {edlSource && <span className={`chip ${edlSource === "llm" ? "ok" : ""}`}>monté par : {edlSource === "llm" ? "IA" : "règles"}</span>}
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={savePrefs}
        style={{ fontSize: 30, fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-0.03em", marginBottom: 20, border: "none", background: "transparent", padding: 0 }}
      />

      {message && <div className="warn-box" style={{ marginBottom: 16 }}>{message}</div>}

      <div className="grid grid-2">
        {/* LEFT: inputs */}
        <div>
          <div className="panel">
            <h2>1 · Médias</h2>
            <div
              className={`dropzone ${drag ? "drag" : ""}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
            >
              {busy === "upload" ? <><span className="spinner" /> Envoi…</> : "Glisse tes rushs, images ou musique — ou clique pour parcourir"}
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="video/*,image/*,audio/*"
                style={{ display: "none" }}
                onChange={(e) => onFiles(e.target.files)}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              {media.length === 0 && <p className="small muted">Aucun média pour l'instant.</p>}
              {media.map((m) => (
                <div key={m.id} className="media-item">
                  <div className="row" style={{ gap: 8 }}>
                    <span className={`kind-tag ${m.kind}`}>{m.kind}</span>
                    <span>{m.originalName}</span>
                  </div>
                  <div className="row" style={{ gap: 10 }}>
                    <span className="meta">
                      {m.durationSec ? `${m.durationSec.toFixed(1)}s · ` : ""}{fmtSize(m.sizeBytes)}
                    </span>
                    <button className="sm danger" onClick={() => deleteAsset(m.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>2 · Script / intention <span className="small muted">(optionnel)</span></h2>
            <textarea
              placeholder="Décris ce que raconte la vidéo (ou laisse vide si tout est dit à l'oral). Les sous-titres viennent de l'AUDIO, pas de ce champ. Mets tes consignes de montage dans « Notes de style » plus bas."
              value={script}
              onChange={(e) => setScript(e.target.value)}
              onBlur={savePrefs}
            />
          </div>

          <div className="panel">
            <h2>3 · Préférences</h2>
            <div className="field-row">
              <div className="field">
                <label>Format</label>
                <select value={prefs.format} onChange={(e) => up("format", e.target.value as EditPreferences["format"])}>
                  <option value="9:16">9:16 vertical</option>
                  <option value="16:9">16:9 large</option>
                  <option value="1:1">1:1 carré</option>
                </select>
              </div>
              <div className="field">
                <label>FPS</label>
                <select value={prefs.fps} onChange={(e) => up("fps", Number(e.target.value) as EditPreferences["fps"])}>
                  {[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Rythme</label>
                <select value={prefs.pace} onChange={(e) => up("pace", e.target.value as EditPreferences["pace"])}>
                  <option value="slow">Lent</option>
                  <option value="medium">Moyen</option>
                  <option value="fast">Rapide</option>
                </select>
              </div>
              <div className="field">
                <label>Transition</label>
                <select value={prefs.transition} onChange={(e) => up("transition", e.target.value as EditPreferences["transition"])}>
                  <option value="auto">✨ Automatique (l'IA varie)</option>
                  <option value="cut">Coupe franche</option>
                  <option value="fade">Fondu</option>
                  <option value="slide">Glissé (droite)</option>
                  <option value="slideUp">Glissé (bas)</option>
                  <option value="zoom">Zoom</option>
                  <option value="wipe">Balayage</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Sous-titres</label>
                <select value={prefs.captions ? "on" : "off"} onChange={(e) => up("captions", e.target.value === "on")}>
                  <option value="on">Activés</option>
                  <option value="off">Désactivés</option>
                </select>
              </div>
              <div className="field">
                <label>Style des sous-titres</label>
                <select value={prefs.captionStyle} onChange={(e) => up("captionStyle", e.target.value as EditPreferences["captionStyle"])}>
                  <option value="phrase">Par phrase</option>
                  <option value="word">Mot par mot</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Police des sous-titres <span className="small muted">(aperçu)</span></label>
              <div className="font-grid">
                {CAPTION_FONTS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`font-chip ${prefs.captionFont === f.key ? "selected" : ""}`}
                    style={{ fontFamily: f.css }}
                    onClick={() => up("captionFont", f.key)}
                    aria-pressed={prefs.captionFont === f.key}
                  >
                    <span className="font-chip-sample">Sous-titre</span>
                    <span className="font-chip-name">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Couper les silences <span className="small muted">(nécessite ffmpeg)</span></label>
              <select value={prefs.removeSilences ? "on" : "off"} onChange={(e) => up("removeSilences", e.target.value === "on")}>
                <option value="off">Désactivé</option>
                <option value="on">Activé — rogne les blancs en bord de clip</option>
              </select>
            </div>
            <div className="field">
              <label>Titre d'intro</label>
              <input type="text" value={prefs.title} onChange={(e) => up("title", e.target.value)} placeholder="(optionnel)" />
            </div>
            <div className="field">
              <label>Style du titre</label>
              <div className="row" style={{ gap: 8 }}>
                {TITLE_STYLE_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`sm ${prefs.titleStyle === k ? "primary" : ""}`}
                    onClick={() => up("titleStyle", k)}
                  >
                    {TITLE_STYLES[k].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Style des encarts <span className="small muted">(textes ajoutés par l'IA — aperçu)</span></label>
              <div className="tpl-grid">
                {OVERLAY_TEMPLATE_KEYS.map((k) => {
                  const t = OVERLAY_TEMPLATES[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      className={`tpl-chip ${prefs.overlayTemplate === k ? "selected" : ""}`}
                      onClick={() => up("overlayTemplate", k)}
                      aria-pressed={prefs.overlayTemplate === k}
                    >
                      <div className="tpl-stage">
                        <span style={overlayChipTextStyle(t)}>#1 JAPON</span>
                      </div>
                      <span className="tpl-name">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="field">
              <label>Musique de fond</label>
              <select value={prefs.musicTrackId ?? ""} onChange={(e) => up("musicTrackId", e.target.value || undefined)}>
                <option value="">— aucune —</option>
                {audios.map((a) => <option key={a.id} value={a.id}>{a.originalName}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Notes de style <span className="small muted">(utilisées par l'IA)</span></label>
              <textarea
                style={{ minHeight: 70 }}
                value={prefs.styleNotes}
                onChange={(e) => up("styleNotes", e.target.value)}
                placeholder="ex. accroche punchy dans les 3 premières secondes, énergique, garder seulement les meilleures prises…"
              />
            </div>
            <button className="sm" onClick={savePrefs}>Enregistrer les préférences</button>
          </div>
        </div>

        {/* RIGHT: actions + preview */}
        <div>
          <div className="panel">
            <h2>4 · Générer le montage</h2>
            <div className="row">
              <button className="primary" onClick={() => generate("auto")} disabled={!!busy || !canGenerate}>
                {busy === "generate" ? <><span className="spinner" /> Génération…</> : "Générer le montage"}
              </button>
            </div>
            {!canGenerate && <p className="small muted" style={{ marginTop: 10 }}>Uploade au moins un rush vidéo pour générer un montage.</p>}

            <button
              type="button"
              className="link-toggle small muted"
              onClick={() => setAdvanced((v) => !v)}
              style={{ marginTop: 12, background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              {advanced ? "▾ Masquer les options avancées" : "▸ Options avancées"}
            </button>
            {advanced && (
              <div className="advanced-box" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border, #2a2a2a)" }}>
                <div className="row" style={{ marginBottom: 10 }}>
                  <button onClick={() => generate("deterministic")} disabled={!!busy || !canGenerate}>Déterministe</button>
                  <button onClick={() => generate("llm")} disabled={!!busy || !canGenerate}>Forcer l'IA</button>
                  <span className="small muted">Force le moteur à base de règles ou l'IA, au lieu du choix automatique.</span>
                </div>
                <div className="row">
                  <button onClick={transcribe} disabled={!!busy || videos.length === 0}>
                    {busy === "transcribe" ? <><span className="spinner" /> Transcription…</> : "Transcrire les rushs"}
                  </button>
                  <span className="small muted">La transcription se lance <strong>automatiquement</strong> à la génération — ce bouton sert juste à la faire à l'avance.</span>
                </div>
              </div>
            )}

            {validation && validation.errors.length > 0 && (
              <div className="error-box" style={{ marginTop: 12 }}>
                <strong>Erreurs de validation :</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            {validation && validation.warnings.length > 0 && (
              <div className="warn-box" style={{ marginTop: 12 }}>
                {validation.warnings.map((w, i) => <div key={i}>{w}</div>)}
              </div>
            )}
          </div>

          <div className="panel">
            <h2>5 · Aperçu</h2>
            {props ? (
              <PlayerPreview props={props} fps={meta.fps} durationInFrames={meta.durationInFrames} width={meta.width} height={meta.height} />
            ) : (
              <div className="player-empty">Génère un montage pour l'aperçu ici</div>
            )}
            <p className="small muted" style={{ marginTop: 10 }}>
              L'aperçu est gratuit — il utilise la même composition que le rendu. Le rendu est l'étape coûteuse.
            </p>
          </div>

          <div className="panel">
            <h2>6 · Rendu MP4</h2>
            <button className="primary" onClick={render} disabled={!!busy || !props}>
              {busy === "render" ? <><span className="spinner" /> Rendu en cours…</> : "Lancer le rendu"}
            </button>
            {renderProgress !== null && (
              <div style={{ marginTop: 12 }}>
                <div className="progressbar"><div style={{ width: `${renderProgress}%` }} /></div>
                <span className="small muted">{renderProgress}%</span>
              </div>
            )}
            {renderUrl && (
              <p style={{ marginTop: 12 }}>
                <a href={renderUrl} download className="primary" style={{ display: "inline-block", padding: "10px 16px", borderRadius: "var(--radius-sm)", background: "var(--lime)", color: "var(--ink)", fontWeight: 700 }}>
                  ↓ Télécharger le MP4
                </a>
              </p>
            )}
          </div>

          {jobs.length > 0 && (
            <div className="panel">
              <h2>Tâches</h2>
              {jobs.slice(0, 8).map((j) => (
                <div key={j.id} className="row spread small" style={{ padding: "4px 0" }}>
                  <span>{j.type}</span>
                  <span className={`chip ${j.status === "completed" ? "ok" : j.status === "failed" ? "err" : ""}`}>{j.status} {j.progress ? `${j.progress}%` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
