"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const PLACEHOLDER = `Écris ta méthode de montage — l'IA l'applique à CHAQUE montage. Exemples :

- Coupe tout silence de plus de 0,3 s, et vire les "euh", les répétitions et les hors-sujet.
- Accroche choc dès les 2 premières secondes, sinon on perd le viewer.
- Rythme nerveux : des plans courts, jamais plus de 4 s sans une coupe ou un zoom.
- Mets un encart à chaque idée clé, court (3-4 mots max), jamais sur mon visage.
- Un zoom "punch" sur chaque révélation importante.
- Ton : cash, direct, jeune. Pas de remplissage.`;

export default function SettingsPage() {
  const [playbook, setPlaybook] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/settings");
        const d = await r.json();
        setPlaybook(d.editingPlaybook ?? "");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setStatus(null);
    const r = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editingPlaybook: playbook }),
    });
    setSaving(false);
    setStatus(r.ok ? "Enregistré ✓ — appliqué à tes prochaines générations." : "Échec de l'enregistrement.");
  }

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <div className="row spread" style={{ marginBottom: 18 }}>
        <Link href="/" className="small muted">← Tous les projets</Link>
      </div>

      <span className="kicker">Réglages</span>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 30, letterSpacing: "-0.03em", margin: "6px 0 6px" }}>
        Ma méthode de montage
      </h1>
      <p className="sub" style={{ marginBottom: 24 }}>
        Tes consignes permanentes pour l'IA — comment cutter, ce qu'il faut garder ou enlever, ton ton.
        Elles s'ajoutent aux « Notes de style » propres à chaque vidéo et s'appliquent à <strong>tous</strong> tes montages.
      </p>

      <div className="panel">
        {loading ? (
          <p className="muted">Chargement…</p>
        ) : (
          <>
            <div className="field">
              <label>Consignes pour l'IA</label>
              <textarea
                style={{ minHeight: 260, fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.6 }}
                value={playbook}
                onChange={(e) => setPlaybook(e.target.value)}
                placeholder={PLACEHOLDER}
              />
            </div>
            <div className="row" style={{ gap: 12 }}>
              <button className="primary" onClick={save} disabled={saving}>
                {saving ? <><span className="spinner" /> Enregistrement…</> : "Enregistrer"}
              </button>
              {status && <span className="small muted">{status}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
