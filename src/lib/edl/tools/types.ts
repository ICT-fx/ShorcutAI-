/**
 * The TOOL CONTRACT. A "tool" is one self-contained motion-graphics capability
 * the AI editor can place on the timeline (an EDL `element`). Each tool lives in
 * its own folder and is the single source of truth for three consumers:
 *   - the LLM prompt (toolbox)  ← manifest.description/whenToUse/paramsDoc/example
 *   - validation                ← manifest.paramsSchema (+ optional validate())
 *   - rendering                 ← the Remotion component
 *
 * manifest.ts (this `ToolManifest`) is data-only and browser+server safe (no
 * Remotion import), so the LLM/validation path never pulls in the render bundle.
 * The component lives in Component.tsx and is wired separately in components.tsx.
 */
import type React from "react";
import type { z } from "zod";
import type { MediaInfo } from "@/lib/types";

/** Cross-check context available to a tool's optional validate() hook. */
export interface ToolValidateContext {
  media: MediaInfo[];
  durationInFrames: number;
}

export interface ToolManifest<P = unknown> {
  /** Stable identifier used as `element.type`. camelCase, e.g. "locationLowerThird". */
  type: string;
  /** Human label (UI / docs). */
  title: string;
  /** What the tool draws — one line, shown to the AI. */
  description: string;
  /** When the AI SHOULD reach for it (and when not). The relevance guidance. */
  whenToUse: string;
  /** Readable description of each param (the AI reads this to fill params). */
  paramsDoc: string;
  /** Validates `element.params`. Input is relaxed (any) so schemas using
   * `.default()`/`.optional()` — whose parsed output type differs from their
   * input type — remain assignable. */
  paramsSchema: z.ZodType<P, z.ZodTypeDef, any>;
  /** A concrete, valid example params object — shown to the AI and self-tested. */
  example: P;
  /** Optional tool-specific cross-checks beyond the schema (asset refs, etc.). */
  validate?: (params: P, ctx: ToolValidateContext) => string[];
}

/** Props every tool component receives. Timing is handled by the parent <Sequence>. */
export interface ToolRenderProps<P = unknown> {
  params: P;
  /** Length of this element's Sequence, in frames. */
  durationInFrames: number;
  /** id -> media descriptor, for tools that reference assets. */
  media: Record<string, MediaInfo>;
}

export type ToolComponent<P = unknown> = React.FC<ToolRenderProps<P>>;
