"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "magic";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

  async function submit() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.assign("/");
        return;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setMsg("Compte créé. Vérifie tes emails pour confirmer, puis connecte-toi.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setMsg("Lien magique envoyé — clique-le dans ton email pour te connecter.");
      }
    } catch (e: any) {
      setErr(e?.message ?? "Erreur d'authentification");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setErr(null);
    setGoogleBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) {
      setErr(error.message);
      setGoogleBusy(false);
    }
  }

  const labels: Record<Mode, string> = { signin: "Se connecter", signup: "Créer le compte", magic: "Envoyer le lien" };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>
          Shortcut<span style={{ color: "var(--accent)" }}>.</span>Edit
        </h1>
        <p className="sub">Connecte-toi pour monter tes vidéos automatiquement.</p>

        {/* Google — mis en avant */}
        <button className="btn-google" onClick={google} disabled={googleBusy}>
          {googleBusy ? <span className="spinner" /> : <GoogleIcon />}
          Continuer avec Google
        </button>

        <div className="divider"><span>ou avec l'email</span></div>

        <div className="auth-tabs">
          {(["signin", "signup", "magic"] as Mode[]).map((m) => (
            <button
              key={m}
              className={mode === m ? "active" : ""}
              onClick={() => { setMode(m); setErr(null); setMsg(null); }}
            >
              {m === "signin" ? "Connexion" : m === "signup" ? "Inscription" : "Lien magique"}
            </button>
          ))}
        </div>

        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.com" />
        </div>
        {mode !== "magic" && (
          <div className="field">
            <label>Mot de passe</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" />
          </div>
        )}

        {err && <div className="error-box" style={{ marginBottom: 12 }}>{err}</div>}
        {msg && <div className="warn-box" style={{ marginBottom: 12 }}>{msg}</div>}

        <button className="primary" onClick={submit} disabled={busy || !email} style={{ width: "100%" }}>
          {busy ? <span className="spinner" /> : labels[mode]}
        </button>
      </div>
    </div>
  );
}
