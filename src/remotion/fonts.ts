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

// Each loadFont() accepts its own literal weight/subset unions, so we pass the
// option object inline (contextual typing validates the arrays) rather than via
// a shared helper that would widen `weights` to string[].
const FAMILIES: Record<string, string> = {
  montserrat: loadMontserrat("normal", {
    weights: ["600", "700", "800"],
    subsets: ["latin"],
    ignoreTooManyRequestsWarning: true,
  }).fontFamily,
  poppins: loadPoppins("normal", {
    weights: ["600", "700"],
    subsets: ["latin"],
    ignoreTooManyRequestsWarning: true,
  }).fontFamily,
  oswald: loadOswald("normal", {
    weights: ["500", "700"],
    subsets: ["latin"],
    ignoreTooManyRequestsWarning: true,
  }).fontFamily,
  bebasneue: loadBebas("normal", {
    weights: ["400"],
    subsets: ["latin"],
    ignoreTooManyRequestsWarning: true,
  }).fontFamily,
  anton: loadAnton("normal", {
    weights: ["400"],
    subsets: ["latin"],
    ignoreTooManyRequestsWarning: true,
  }).fontFamily,
};

const FALLBACK = `${FAMILIES.montserrat}, system-ui, sans-serif`;

/** Resolve a font key to a CSS font-family string (with fallback). */
export function fontFamilyFor(key?: string): string {
  if (key && FAMILIES[key]) return `${FAMILIES[key]}, system-ui, sans-serif`;
  return FALLBACK;
}
