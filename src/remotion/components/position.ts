import type React from "react";
import type { Position } from "../../lib/edl/schema";

/**
 * Translates an EDL Position into CSS. Named positions use flexbox alignment on
 * a full-canvas container; {x,y} (normalized 0..1) places the element's center
 * at that point.
 */
export function positionContainerStyle(pos: Position): React.CSSProperties {
  if (pos === "top") {
    return { justifyContent: "flex-start", alignItems: "center", paddingTop: "8%" };
  }
  if (pos === "center") {
    return { justifyContent: "center", alignItems: "center" };
  }
  if (pos === "bottom") {
    return { justifyContent: "flex-end", alignItems: "center", paddingBottom: "12%" };
  }
  // Explicit coordinates.
  return { justifyContent: "flex-start", alignItems: "flex-start" };
}

export function isCoordPosition(pos: Position): pos is { x: number; y: number } {
  return typeof pos === "object";
}
