# Tool-aware editing — design

Date: 2026-05-31
Status: approved, implementing

## Problem

Today the LLM editor produces an EDL from a fixed vocabulary (clips, text/image
overlays, captions, transitions, music). The visual capabilities are limited to
what the renderer already knows how to draw, and the knowledge of "what the AI
can do" is implicit in a hand-written prompt. Two consequences:

1. To make the editor *smarter*, the AI should reason about which capabilities
   ("tools") exist and decide per-video whether each is relevant — and it must
   honour explicit user requests ("show a map with a plane flying from France to
   Japan when I mention the trip").
2. Adding a new visual capability today means editing four desynchronisable
   files (schema, validate, prompt, AutoEdit). This does not scale to a rich
   library of motion-graphics components.

## Goal

Build the *framework* (the "brain") that makes the editor tool-aware, validated
end-to-end by one simple pilot component. After the framework exists, adding a
new component is a single self-contained folder and the AI knows about it
automatically.

Out of scope for this iteration: building the full component library (flight
map, stat counters, price reveal, color grading…). Those are follow-up tools
added on top of this framework.

## Architecture

### 1. A tool = one self-contained folder (single source of truth)

```
src/lib/edl/tools/
  <toolName>/
    manifest.ts     # data only (browser+server safe, NO Remotion import):
                    #   type, title, description, whenToUse, paramsDoc,
                    #   paramsSchema (Zod), example
    Component.tsx   # the Remotion component (props = validated params + timing + media)
  manifests.ts      # MANIFESTS: Record<type, ToolManifest>  (prompt + validate)
  components.tsx    # COMPONENTS: Record<type, ToolComponent> (AutoEdit render)
  types.ts          # ToolManifest, ToolComponent, ToolRenderProps
```

The manifest is the source of truth used in three places automatically:
- **prompt** — `description` + `whenToUse` + `paramsDoc` + `example` become the
  AI's toolbox,
- **validation** — `paramsSchema` validates `element.params`,
- **render** — the matching component draws it.

`manifests.ts` (data) and `components.tsx` (Remotion) are split so that the
server/LLM path never imports the Remotion bundle. They are kept in sync by an
integrity check (identical key sets); adding a tool means one import line in
each.

### 2. New `elements` track in the EDL

The existing text/image overlays are untouched. A dedicated track carries the
motion-graphics tools:

```ts
tracks: {
  clips, overlays, captions,
  elements: [ { id, type, params, startFrame, endFrame } ]  // NEW
}
```

`params` is an open `record` at the EDL-schema level (so schema.ts stays free of
tool imports — no circular dependency); the per-tool `paramsSchema` validates it
in validate.ts.

### 3. Two-phase generation

```
media + transcripts + brief (script/playbook/styleNotes) + TOOLBOX (auto from manifests)
        │
        ▼  PHASE 1 — PLAN (1 LLM call, plan.ts)
        │   analyses rushes + reads explicit user requests
        │   decides which tools, where (transcript cue), why
        │   flags requests with no matching tool -> unsupportedRequests[]
        ▼  PHASE 2 — EDIT (1 LLM call, editorial.ts)
        │   writes the EDL skeleton (clips + overlays + elements) following the plan
        ▼  validate (per-tool schema) -> repair loop -> compile -> render
```

The toolbox lives in the (cached) system prompt — stable across projects, so it
benefits from prompt caching. Phase 1 failure degrades gracefully to a
plan-less Phase 2 (the toolbox is still present); Phase 2 failure degrades to
the deterministic editor, exactly as today. The app never fails to produce a
video.

### 4. Honouring + reporting explicit requests

The user's free-text brief (script / styleNotes / playbook) is already top
priority for the AI. Phase 1 additionally returns `unsupportedRequests` — things
the user explicitly asked for that no tool can satisfy yet. These bubble up as a
`warning` on the generate result (the existing `data.warning` → `setMessage`
channel in the editor) — e.g. "Tu as demandé une carte animée — pas encore
disponible, montage généré sans." They are also logged so the most-requested
missing tools inform what to build next.

## Pilot component — `locationLowerThird`

Params:
```ts
{ place: string,            // "Tokyo, Japon"
  sublabel?: string,        // optional second line
  icon?: "pin" | "none" }   // default pin
```
Look: lower-third bar above the caption safe-zone, slide+fade entrance, hold,
fade out. Styled consistently with existing overlay aesthetics (fontFamilyFor).
The AI sets `place`, `startFrame`, `endFrame` from the transcript moment where a
location is mentioned. Deliberately simple so a failure points at the framework,
not the component.

## Validation

For each element: `type ∈ MANIFESTS`, `paramsSchema.safeParse(params)`, timing
sane (`endFrame > startFrame`; ends past the timeline warn-only, like overlays).
An optional per-manifest `validate(params, ctx)` hook covers tool-specific
cross-checks (e.g. asset references); the pilot needs none. Failures feed the
existing LLM repair loop.

## Rendering

`compile.ts` passes `tracks.elements` through into `AutoEditProps.elements` and
includes their `endFrame` in the timeline duration. `AutoEdit.tsx` maps elements
to `COMPONENTS[type]` inside a `<Sequence from/durationInFrames>`, passing
`params`, `durationInFrames`, and `media`. Preview stays free (same props path
as render).

## Safety net

The deterministic editor is unchanged and emits no elements (empty track). The
LLM path falls back to it on any failure. The two-phase logic lives entirely on
the LLM path.

## Cost

Two LLM calls instead of one. Mitigated: the large stable system prompt + the
toolbox are prompt-cached (~0.1x); the plan output is small. Modest, bounded
increase.

## Testing / verification

No test runner exists in the repo; verification is a `tsx`-runnable script plus
`tsc --noEmit`:
- registry integrity — `MANIFESTS` and `COMPONENTS` have identical key sets,
  every manifest parses its own `example` with its `paramsSchema`;
- `validateEDL` rejects an element with an unknown `type` and with bad `params`;
- a fixture EDL containing a `locationLowerThird` element compiles via
  `compileEDL` without error and surfaces in `AutoEditProps.elements`.

Formal unit tests (vitest) and a Remotion render smoke test can be added later
without changing this design.

## Files

Create:
- `src/lib/edl/tools/types.ts`
- `src/lib/edl/tools/manifests.ts`
- `src/lib/edl/tools/components.tsx`
- `src/lib/edl/tools/locationLowerThird/manifest.ts`
- `src/lib/edl/tools/locationLowerThird/Component.tsx`
- `src/lib/llm/toolbox.ts`
- `src/lib/llm/plan.ts`
- `scripts/verify-tools.ts`

Modify:
- `src/lib/edl/schema.ts` — `ElementSchema` + `tracks.elements`
- `src/lib/edl/validate.ts` — element validation
- `src/lib/edl/compile.ts` — pass elements through + duration
- `src/remotion/AutoEdit.tsx` — render elements track
- `src/lib/llm/prompt.ts` — inject toolbox + `elements` in output spec + render plan
- `src/lib/llm/editorial.ts` — run Phase 1, thread plan + elements, return unsupportedRequests
- `src/lib/edl/generate.ts` — map unsupportedRequests → warning
```
