/**
 * Renders the registered tools into a TEXT "toolbox" injected into the LLM
 * prompts. Generated from the manifests (single source of truth), so when a tool
 * folder is added the AI knows about it automatically — no prompt edits.
 *
 * Stable across projects (depends only on the registry), so it lives in the
 * cached system prompt.
 */
import { MANIFESTS } from "@/lib/edl/tools/manifests";

export function buildToolboxPrompt(): string {
  const tools = Object.values(MANIFESTS);
  if (tools.length === 0) return "(no motion-graphics tools available)";

  const blocks = tools.map((m) => {
    const example = JSON.stringify(m.example);
    return [
      `### ${m.type} — ${m.title}`,
      m.description,
      `WHEN TO USE: ${m.whenToUse}`,
      `PARAMS: ${m.paramsDoc}`,
      `EXAMPLE params: ${example}`,
    ].join("\n");
  });

  return blocks.join("\n\n");
}

/** The list of valid `type` strings, for prompt hard-rules. */
export function toolTypeList(): string {
  return Object.keys(MANIFESTS)
    .map((t) => `"${t}"`)
    .join(", ");
}
