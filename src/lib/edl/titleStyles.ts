/**
 * Intro-title presets, chosen by the user via buttons. Each maps to concrete
 * EDL Overlay fields (font / size / position / animation / colors). Shared by
 * the deterministic editor and the LLM path so the title always honours the
 * user's choice regardless of which editor produced the EDL.
 */
export type TitleStyleKey = "bold" | "boxed" | "minimal" | "kinetic";

export interface TitlePreset {
  label: string;
  fontKey: string; // resolved to a real font family in the Remotion bundle
  position: "top" | "center" | "bottom";
  animation: "fadeIn" | "slideUp" | "slideDown" | "scaleIn" | "none";
  color: string;
  backgroundColor: string; // "transparent" for no box
  /** Title font size as a fraction of canvas width. */
  sizeFraction: number;
}

export const TITLE_STYLES: Record<TitleStyleKey, TitlePreset> = {
  bold: {
    label: "Bold",
    fontKey: "anton",
    position: "center",
    animation: "scaleIn",
    color: "#ffffff",
    backgroundColor: "transparent",
    sizeFraction: 0.12,
  },
  boxed: {
    label: "Encadré",
    fontKey: "montserrat",
    position: "center",
    animation: "fadeIn",
    color: "#0b0d05",
    backgroundColor: "#c8f135",
    sizeFraction: 0.085,
  },
  minimal: {
    label: "Minimal",
    fontKey: "poppins",
    position: "bottom",
    animation: "slideUp",
    color: "#ffffff",
    backgroundColor: "transparent",
    sizeFraction: 0.058,
  },
  kinetic: {
    label: "Kinetic",
    fontKey: "bebasneue",
    position: "center",
    animation: "slideUp",
    color: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.35)",
    sizeFraction: 0.14,
  },
};

export const TITLE_STYLE_KEYS = Object.keys(TITLE_STYLES) as TitleStyleKey[];
