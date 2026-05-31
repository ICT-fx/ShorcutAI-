/**
 * The COMPONENT registry — maps an element `type` to its Remotion component.
 * Imported only by the render path (AutoEdit). Adding a tool = import its
 * component here (and its manifest in manifests.ts). Kept in sync with MANIFESTS
 * by scripts/verify-tools.ts.
 */
import type { ToolComponent } from "./types";
import { LocationLowerThird } from "./locationLowerThird/Component";

export const COMPONENTS: Record<string, ToolComponent<any>> = {
  locationLowerThird: LocationLowerThird,
};

export function getToolComponent(type: string): ToolComponent<any> | undefined {
  return COMPONENTS[type];
}
