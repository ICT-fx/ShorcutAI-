/**
 * Pilot tool: an animated lower-third naming a place (e.g. "📍 Tokyo, Japon").
 * Deliberately simple — it exercises the whole tool framework end-to-end
 * (registry → toolbox → plan → EDL → validation → render) without geo data. It
 * is also the first step toward a richer map/flight-path component.
 */
import { z } from "zod";
import type { ToolManifest } from "../types";

export const paramsSchema = z.object({
  /** Place name to display, e.g. "Tokyo, Japon" or "Bali". */
  place: z.string().min(1).max(60),
  /** Optional second line under the place (a caption / context). */
  sublabel: z.string().max(80).optional(),
  /** Leading map-pin icon, or none. */
  icon: z.enum(["pin", "none"]).default("pin"),
});

export type LocationLowerThirdParams = z.infer<typeof paramsSchema>;

export const manifest: ToolManifest<LocationLowerThirdParams> = {
  type: "locationLowerThird",
  title: "Lower-third localisation",
  description: "An animated lower-third bar naming a place, with an optional map-pin icon and a second line of context.",
  whenToUse:
    "Use the moment a specific place (city, country, region, venue) is first mentioned in the speech — to anchor the viewer. Time it to that transcript moment, keep it on screen ~2-3s, and do NOT repeat it for the same place. Skip it when no concrete location is named.",
  paramsDoc:
    'params: { "place": string (required, the location name), "sublabel"?: string (optional context line), "icon"?: "pin" | "none" (default "pin") }',
  paramsSchema,
  example: { place: "Tokyo, Japon", sublabel: "jour 1", icon: "pin" },
};
