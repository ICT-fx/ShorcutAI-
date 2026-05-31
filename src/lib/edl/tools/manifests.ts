/**
 * The MANIFEST registry — data only (no Remotion import), so the LLM and
 * validation paths can use it without pulling in the render bundle. Adding a
 * tool = import its manifest here (and its component in components.tsx). The
 * integrity check in scripts/verify-tools.ts asserts the two stay in sync.
 */
import type { ToolManifest } from "./types";
import { manifest as locationLowerThird } from "./locationLowerThird/manifest";

const ALL: ToolManifest<any>[] = [locationLowerThird];

export const MANIFESTS: Record<string, ToolManifest<any>> = Object.fromEntries(
  ALL.map((m) => [m.type, m]),
);

export function getManifest(type: string): ToolManifest<any> | undefined {
  return MANIFESTS[type];
}

export const TOOL_TYPES = Object.keys(MANIFESTS);
