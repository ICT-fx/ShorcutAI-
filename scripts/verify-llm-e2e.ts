/**
 * REAL end-to-end check of the two-phase tool-aware pipeline against the live
 * Anthropic API (uses ANTHROPIC_API_KEY from .env). No DB/server/media files
 * needed — a synthetic project with a fake video + transcript.
 *
 *   ./node_modules/.bin/tsx scripts/verify-llm-e2e.ts
 *
 * Scenario: a travel video whose transcript names Tokyo then Bali, and a brief
 * that ALSO asks for an animated map (a capability no tool can deliver yet). We
 * expect: clips produced, at least one `locationLowerThird` element placed, and
 * the map request surfaced in unsupportedRequests.
 */
import { generateLlmEDL } from "../src/lib/llm/editorial";
import { EditPreferencesSchema, type MediaInfo, type TranscriptResult } from "../src/lib/types";

function words(text: string, start: number, end: number) {
  const toks = text.split(/\s+/).filter(Boolean);
  const step = (end - start) / toks.length;
  return toks.map((word, i) => ({
    word,
    start: +(start + i * step).toFixed(2),
    end: +(start + (i + 1) * step).toFixed(2),
  }));
}

const segs = [
  { id: 0, start: 0, end: 8, text: "Bienvenue dans mon voyage. Premier arrêt Tokyo au Japon une ville incroyable." },
  { id: 1, start: 8, end: 18, text: "On a mangé des ramen visité des temples c'était vraiment magique." },
  { id: 2, start: 18, end: 28, text: "Ensuite direction Bali en Indonésie pour se détendre sur la plage." },
];

const transcript: TranscriptResult = {
  provider: "fake",
  language: "fr",
  durationSec: 30,
  segments: segs.map((s) => ({ id: s.id, start: s.start, end: s.end, text: s.text })),
  words: segs.flatMap((s) => words(s.text, s.start, s.end)),
};

const media: MediaInfo[] = [
  { id: "v1", kind: "video", originalName: "trip.mp4", url: "http://localhost/v1.mp4", mimeType: "video/mp4", durationSec: 30, hasAudio: true },
];

const prefs = EditPreferencesSchema.parse({
  pace: "fast",
  captions: true,
  title: "Mon voyage",
  styleNotes:
    "Sous-titres sur toute la vidéo. Titres animés 'Top 2 / Top 1 + nom du pays' en plein écran stylisé. Zooms dynamiques sur les moments clés. Et un avion qui passe sur la vidéo à chaque nouveau pays.",
});

async function main() {
  console.log("Calling the two-phase LLM editor (Phase 1 plan → Phase 2 edit)...\n");
  const t0 = Date.now();
  const { edl, unsupportedRequests } = await generateLlmEDL({
    project: { script: "" } as any,
    prefs,
    media,
    transcripts: { v1: transcript },
    script: "Vlog de voyage: Tokyo puis Bali. Rythme rapide, punchy.",
    playbook: "",
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const locEls = edl.tracks.elements.filter((e) => e.type === "locationLowerThird");
  console.log(`Done in ${secs}s\n`);
  console.log(`clips:            ${edl.tracks.clips.length}`);
  console.log(`captions:         ${edl.tracks.captions.length}`);
  console.log(`elements (total): ${edl.tracks.elements.length}`);
  console.log(`  locationLowerThird: ${locEls.length}`);
  for (const e of locEls) {
    console.log(`    - "${(e.params as any).place}" @ frames ${e.startFrame}-${e.endFrame}` + ((e.params as any).sublabel ? ` (sub: "${(e.params as any).sublabel}")` : ""));
  }
  console.log(`unsupportedRequests: ${unsupportedRequests.length}`);
  for (const r of unsupportedRequests) console.log(`    - "${r.request}"${r.reason ? ` — ${r.reason}` : ""}`);

  // Core capabilities must NEVER be flagged unsupported (the bug we fixed).
  const unsupportedText = unsupportedRequests.map((r) => `${r.request} ${r.reason ?? ""}`.toLowerCase()).join(" | ");
  const wronglyFlagged = ["sous-titre", "subtitle", "caption", "zoom", "titre", "title"].filter((w) => unsupportedText.includes(w));
  const flagsPlane = /avion|plane|carte|map|flight/.test(unsupportedText);

  console.log("\n--- assertions ---");
  const checks: [string, boolean][] = [
    ["produced at least one clip", edl.tracks.clips.length > 0],
    ["placed at least one locationLowerThird", locEls.length > 0],
    ["flagged the plane/map as unsupported", flagsPlane],
    [`did NOT wrongly flag core features as unsupported (found: ${wronglyFlagged.join(", ") || "none"})`, wronglyFlagged.length === 0],
  ];
  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (!ok) failed++;
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
