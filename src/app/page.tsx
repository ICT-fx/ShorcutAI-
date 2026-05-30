"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  format: string;
  updatedAt: string;
  _count: { media: number; jobs: number };
}

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("9:16");
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    setCreating(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || "Projet sans titre", preferences: { format } }),
    });
    const data = await res.json();
    setCreating(false);
    if (data.project) router.push(`/projects/${data.project.id}`);
  }

  return (
    <div className="container">
      <div className="hero">
        <span className="eyebrow">● Montage automatique · Remotion</span>
        <h1>
          De tes rushs à un <span className="accent">short monté</span>,<br />
          automatiquement.
        </h1>
        <p className="sub">
          Uploade tes rushs, colle ton script, choisis ton style — récupère un MP4 monté,
          prévisualisé puis rendu sans toucher une timeline.
        </p>
      </div>

      <div className="panel">
        <h2>Nouveau projet</h2>
        <div className="row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <input
              type="text"
              placeholder="Titre du projet"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
          </div>
          <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ width: 150 }}>
            <option value="9:16">9:16 vertical</option>
            <option value="16:9">16:9 large</option>
            <option value="1:1">1:1 carré</option>
          </select>
          <button className="primary" onClick={create} disabled={creating}>
            {creating ? <span className="spinner" /> : "Créer →"}
          </button>
        </div>
      </div>

      <h2 style={{ marginTop: 36 }}>Tes projets</h2>
      {loading ? (
        <p className="muted">Chargement…</p>
      ) : projects.length === 0 ? (
        <p className="muted">Aucun projet pour l'instant. Crée-en un ci-dessus pour démarrer.</p>
      ) : (
        <div className="cards">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="project-card">
              <div className="row spread">
                <strong>{p.title}</strong>
                <span className="chip">{p.format}</span>
              </div>
              <div className="small muted" style={{ marginTop: 10, fontFamily: "var(--font-mono)" }}>
                {p._count.media} média · {p._count.jobs} jobs · {p.status}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
