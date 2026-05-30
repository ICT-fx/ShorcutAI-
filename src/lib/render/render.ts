/**
 * Programmatic Remotion render. The worker (or the inline job fallback) calls
 * renderProject(); it bundles the SAME entry the <Player> uses, selects the
 * AutoEdit composition with the compiled EDL as inputProps, renders an MP4 and
 * stores it through the StorageAdapter.
 *
 * The render Chrome fetches media over HTTP via APP_BASE_URL, so the Next app
 * must be running during a render (documented in the README).
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { prisma } from "@/lib/db";
import { compileEDL } from "@/lib/edl/compile";
import { parseEDL } from "@/lib/edl/schema";
import { validateEDL } from "@/lib/edl/validate";
import { getProjectMedia } from "@/lib/project";
import { getStorage } from "@/lib/storage";

// Cache the bundle across renders in the same process (cheap re-renders).
let bundlePromise: Promise<string> | null = null;

function getBundle(): Promise<string> {
  if (!bundlePromise) {
    const entry = path.join(process.cwd(), "src", "remotion", "index.ts");
    bundlePromise = bundle({
      entryPoint: entry,
      // Keep webpack defaults; our Remotion code uses relative imports only.
    });
  }
  return bundlePromise;
}

export interface RenderResult {
  outputKey: string;
  url: string;
  durationInFrames: number;
  durationSeconds: number;
  bytes: number;
}

export async function renderProject(
  projectId: string,
  jobId: string,
  onProgress?: (pct: number) => void,
): Promise<RenderResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error(`Project ${projectId} not found`);
  if (!project.edlJson) throw new Error("Project has no EDL; generate one before rendering.");

  const edl = parseEDL(JSON.parse(project.edlJson));
  const media = await getProjectMedia(projectId);

  const check = validateEDL(edl, media);
  if (!check.ok) {
    throw new Error(`EDL failed validation before render:\n- ${check.errors.join("\n- ")}`);
  }

  const props = compileEDL(edl, media);

  const serveUrl = await getBundle();
  const composition = await selectComposition({
    serveUrl,
    id: "AutoEdit",
    inputProps: props,
  });

  const tempDir = await mkdtemp(path.join(tmpdir(), "render-"));
  const outFile = path.join(tempDir, "out.mp4");

  try {
    await renderMedia({
      serveUrl,
      composition,
      codec: "h264",
      outputLocation: outFile,
      inputProps: props,
      onProgress: ({ progress }) => onProgress?.(Math.round(progress * 100)),
    });

    const bytes = await readFile(outFile);
    const storage = getStorage();
    const outputKey = `outputs/${projectId}/${jobId}.mp4`;
    await storage.put(outputKey, bytes, { contentType: "video/mp4" });

    return {
      outputKey,
      url: storage.publicUrl(outputKey),
      durationInFrames: props.meta.durationInFrames,
      durationSeconds: props.meta.durationInFrames / props.meta.fps,
      bytes: bytes.length,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
