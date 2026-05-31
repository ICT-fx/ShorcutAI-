/**
 * Framework verification (no test runner in this repo). Run with:
 *   npx tsx scripts/verify-tools.ts
 *
 * Checks:
 *  1. registry integrity — MANIFESTS and COMPONENTS share identical keys, and
 *     every manifest validates its own `example` with its `paramsSchema`;
 *  2. validateEDL rejects an element with an unknown type and with bad params,
 *     and accepts a well-formed one;
 *  3. a fixture EDL with a `locationLowerThird` element compiles and surfaces in
 *     AutoEditProps.elements.
 */
import { MANIFESTS } from "../src/lib/edl/tools/manifests";
import { COMPONENTS } from "../src/lib/edl/tools/components";
import { parseEDL } from "../src/lib/edl/schema";
import { validateEDL } from "../src/lib/edl/validate";
import { compileEDL } from "../src/lib/edl/compile";
import type { MediaInfo } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("1. Registry integrity");
const manifestKeys = Object.keys(MANIFESTS).sort();
const componentKeys = Object.keys(COMPONENTS).sort();
check("MANIFESTS and COMPONENTS have identical keys", JSON.stringify(manifestKeys) === JSON.stringify(componentKeys), `${manifestKeys} vs ${componentKeys}`);
check("at least one tool registered", manifestKeys.length > 0);
for (const [type, m] of Object.entries(MANIFESTS)) {
  check(`${type}.type matches its key`, m.type === type);
  const parsed = m.paramsSchema.safeParse(m.example);
  check(`${type}.example validates against paramsSchema`, parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
}

console.log("\n2. Element validation");
const media: MediaInfo[] = [
  { id: "v1", kind: "video", originalName: "rush.mp4", url: "http://x/v1.mp4", mimeType: "video/mp4", durationSec: 10 },
];
function edlWithElement(el: unknown) {
  return parseEDL({
    version: 1,
    meta: { fps: 30, width: 1080, height: 1920, durationInFrames: 300 },
    tracks: {
      clips: [{ id: "c1", sourceId: "v1", inPoint: 0, outPoint: 5 }],
      overlays: [],
      captions: [],
      elements: [el],
    },
    transitions: [],
    style: { captionFont: "montserrat", overlayTemplate: "punch" },
  });
}
const goodEl = { id: "el-1", type: "locationLowerThird", params: { place: "Tokyo, Japon", icon: "pin" }, startFrame: 30, endFrame: 120 };
check("well-formed element passes", validateEDL(edlWithElement(goodEl), media).ok);
const unknownEl = { id: "el-2", type: "doesNotExist", params: {}, startFrame: 0, endFrame: 30 };
check("unknown tool type is rejected", !validateEDL(edlWithElement(unknownEl), media).ok);
const badParamsEl = { id: "el-3", type: "locationLowerThird", params: { icon: "pin" }, startFrame: 0, endFrame: 30 };
check("missing required param is rejected", !validateEDL(edlWithElement(badParamsEl), media).ok);

console.log("\n3. Compile passes elements through");
const compiled = compileEDL(edlWithElement(goodEl), media);
check("AutoEditProps.elements has the element", compiled.elements.length === 1 && compiled.elements[0].type === "locationLowerThird");
check("timeline covers the element endFrame", compiled.meta.durationInFrames >= 120);

console.log(failures === 0 ? "\nALL CHECKS PASSED ✓" : `\n${failures} CHECK(S) FAILED ✗`);
process.exit(failures === 0 ? 0 : 1);
