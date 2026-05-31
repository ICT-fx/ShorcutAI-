/**
 * Visual templates for the AI-added text encarts (callouts: list labels, hooks,
 * arguments, CTAs) — the "TikTok-quality" looks the user picks from. Chosen once
 * per project; the renderer styles every non-title text overlay with it, so the
 * look is consistent regardless of what the AI wrote.
 *
 * Browser-safe (no Remotion imports) so the Editor can render live preview chips
 * from the same source of truth. `fontKey` resolves to a real family via
 * fontFamilyFor() in the Remotion bundle, and via CSS_FONT_FAMILY in the editor.
 */
export type OverlayTemplateKey = "punch" | "pastille" | "contour" | "neon";

export interface OverlayTemplate {
  label: string;
  /** Font key shared with captions/titles (montserrat | poppins | oswald | bebasneue | anton). */
  fontKey: string;
  fontWeight: number;
  /** Text fill colour. */
  color: string;
  /** Box background, or null for no box (text-only look). */
  background: string | null;
  /** Text outline colour, or null for none. */
  strokeColor: string | null;
  /** Outline width in px at a 1080px-wide reference (scaled by the renderer). */
  strokeWidthPx: number;
  borderRadius: number;
  uppercase: boolean;
  letterSpacing: string;
  /** CSS text-shadow (glow / drop). */
  shadow: string;
  /** Default font size as a fraction of canvas width (when the overlay has none). */
  sizeFraction: number;
}

export const OVERLAY_TEMPLATES: Record<OverlayTemplateKey, OverlayTemplate> = {
  // Classic TikTok: condensed heavy text, thick black outline, no box.
  punch: {
    label: "Punch",
    fontKey: "anton",
    fontWeight: 400, // Anton is already heavy
    color: "#ffffff",
    background: null,
    strokeColor: "#000000",
    strokeWidthPx: 9,
    borderRadius: 0,
    uppercase: true,
    letterSpacing: "0.01em",
    shadow: "0 4px 18px rgba(0,0,0,0.55)",
    sizeFraction: 0.066,
  },
  // Bright rounded pill with dark text — punchy, very readable.
  pastille: {
    label: "Pastille",
    fontKey: "poppins",
    fontWeight: 700,
    color: "#0b0d05",
    background: "#c8f135",
    strokeColor: null,
    strokeWidthPx: 0,
    borderRadius: 18,
    uppercase: false,
    letterSpacing: "0",
    shadow: "0 10px 30px -10px rgba(0,0,0,0.55)",
    sizeFraction: 0.055,
  },
  // Clean white text with a crisp dark outline, no box — elegant overlay.
  contour: {
    label: "Contour",
    fontKey: "montserrat",
    fontWeight: 800,
    color: "#ffffff",
    background: null,
    strokeColor: "#0b0d05",
    strokeWidthPx: 6,
    borderRadius: 0,
    uppercase: false,
    letterSpacing: "-0.01em",
    shadow: "0 3px 14px rgba(0,0,0,0.5)",
    sizeFraction: 0.058,
  },
  // Neon: lime text on a dark translucent slab with a glow.
  neon: {
    label: "Néon",
    fontKey: "oswald",
    fontWeight: 700,
    color: "#c8f135",
    background: "rgba(11,13,5,0.62)",
    strokeColor: null,
    strokeWidthPx: 0,
    borderRadius: 12,
    uppercase: true,
    letterSpacing: "0.02em",
    shadow: "0 0 18px rgba(200,241,53,0.55)",
    sizeFraction: 0.06,
  },
};

export const OVERLAY_TEMPLATE_KEYS = Object.keys(OVERLAY_TEMPLATES) as OverlayTemplateKey[];

/** Editor-side CSS family per font key (the Remotion bundle uses fontFamilyFor). */
export const CSS_FONT_FAMILY: Record<string, string> = {
  montserrat: "'Montserrat', sans-serif",
  poppins: "'Poppins', sans-serif",
  oswald: "'Oswald', sans-serif",
  bebasneue: "'Bebas Neue', sans-serif",
  anton: "'Anton', sans-serif",
};
