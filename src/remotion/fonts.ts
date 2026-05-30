/**
 * Fonts available for captions + titles inside the rendered video. Loaded via
 * @remotion/google-fonts so they're self-hosted and guaranteed ready before a
 * frame renders (works in both the <Player> and renderMedia). Keys match the
 * EditPreferences `captionFont` enum and the title-style `fontKey`s.
 *
 * We load only the Latin subset + the weights we actually use, to avoid the
 * "made 90 network requests" blow-up that slows every render.
 */
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadBebas } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";

const opts = (weights: string[]) =>
  ({ weights, subsets: ["latin"], ignoreTooManyRequestsWarning: true }) as const;

const FAMILIES: Record<string, string> = {
  montserrat: loadMontserrat("normal", opts(["600", "700", "800"])).fontFamily,
  poppins: loadPoppins("normal", opts(["600", "700"])).fontFamily,
  oswald: loadOswald("normal", opts(["500", "700"])).fontFamily,
  bebasneue: loadBebas("normal", opts(["400"])).fontFamily,
  anton: loadAnton("normal", opts(["400"])).fontFamily,
};

const FALLBACK = `${FAMILIES.montserrat}, system-ui, sans-serif`;

/** Resolve a font key to a CSS font-family string (with fallback). */
export function fontFamilyFor(key?: string): string {
  if (key && FAMILIES[key]) return `${FAMILIES[key]}, system-ui, sans-serif`;
  return FALLBACK;
}
