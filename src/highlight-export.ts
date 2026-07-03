import { join } from "node:path";
import { type ExportOptions, exportCut } from "./exporter.ts";
import { projectPaths } from "./paths.ts";
import { loadProject } from "./projectStore.ts";

export function highlightOutPath(slug: string, clipId: string): string {
  const p = projectPaths(slug);
  return join(p.highlightsDir, `${clipId}.mp4`);
}

export async function exportHighlight(
  slug: string,
  clipId: string,
  opts: ExportOptions = {}
) {
  const project = await loadProject(slug);
  const highlights = project.highlights;
  if (!highlights || highlights.clips.length === 0) {
    throw new Error(`no highlights on project "${slug}"`);
  }
  const clip = highlights.clips.find((c) => c.id === clipId);
  if (!clip) {
    throw new Error(`highlight clip not found: ${clipId}`);
  }
  return exportCut(slug, {
    ...opts,
    sourceSpan: { fromSec: clip.fromSec, toSec: clip.toSec },
    outPath: highlightOutPath(slug, clipId),
  });
}

export async function exportAllHighlights(
  slug: string,
  opts: ExportOptions = {}
): Promise<{
  exported: Array<{ id: string; out: string; durationSec: number }>;
}> {
  const project = await loadProject(slug);
  const highlights = project.highlights;
  if (!highlights || highlights.clips.length === 0) {
    throw new Error(`no highlights on project "${slug}"`);
  }
  const exported: Array<{ id: string; out: string; durationSec: number }> = [];
  for (const clip of highlights.clips) {
    const result = await exportHighlight(slug, clip.id, opts);
    exported.push({
      id: clip.id,
      out: result.out,
      durationSec: result.durationSec,
    });
  }
  return { exported };
}
