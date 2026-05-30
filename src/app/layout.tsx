import type { Metadata } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
});
const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Shortcut.Edit — montage vidéo automatique",
  description:
    "Tes rushs + ton script + tes préférences → un MP4 monté automatiquement, rendu avec Remotion.",
};

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M8 5v14l11-7z" fill="currentColor" />
      </svg>
    </span>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="fr" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {/* Caption-font previews in the editor (next/font handles the UI fonts). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Montserrat:wght@700&family=Oswald:wght@500&family=Poppins:wght@600&display=swap"
        />
        <div className="topbar">
          <Link href="/" className="brand">
            <BrandMark />
            Shortcut<span className="dot">.</span>Edit
          </Link>
          {user ? (
            <div className="row" style={{ gap: 14 }}>
              <span className="user-pill">{user.email}</span>
              <form action="/auth/signout" method="post" style={{ margin: 0 }}>
                <button className="sm" type="submit">Déconnexion</button>
              </form>
            </div>
          ) : (
            <span className="small muted">Montage IA · Remotion</span>
          )}
        </div>
        {children}
      </body>
    </html>
  );
}
