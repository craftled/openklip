import { statSync } from "node:fs";
import { syncAssetsFromFolder } from "@engine/asset-scanner";
import { loadAudioAnalysis } from "@engine/audio-analysis";
import type { SilenceSpan } from "@engine/audio-analysis-core";
import { loadBrief } from "@engine/brief";
import { formatDisplayPath } from "@engine/display-path";
import { projectPaths } from "@engine/paths";
import { loadProject, resolveSlug } from "@engine/projectStore";

export async function loadEditorProject(slugParam?: string | null) {
  const slug = resolveSlug(slugParam);
  try {
    // Best-effort: keep first paint aligned with assets/ without blocking load.
    await syncAssetsFromFolder(slug);
  } catch {
    // A bad drop, proxy build failure, or I/O error must not break the editor.
  }
  const project = await loadProject(slug);
  const paths = projectPaths(slug);
  const mediaVersion = Math.round(statSync(paths.proxy).mtimeMs);
  // Best-effort: a missing/corrupt brief.md must not break the editor load.
  const brief = await loadBrief(slug).catch(() => undefined);
  // Only pay the VAD analysis cost for projects that actually snap to it; a
  // failed/missing analysis must not break the editor load either. Note: the
  // first time a project enables snap, THIS load computes+caches the
  // analysis, so the next page load is instant.
  const silences: SilenceSpan[] | null =
    project.cuts?.snap?.enabled && project.cuts.snap.mode === "vad"
      ? await loadAudioAnalysis(slug)
          .then((a) => a.silences)
          .catch(() => null)
      : null;
  return {
    ...project,
    dirPath: formatDisplayPath(paths.dir),
    mediaVersion,
    brief: brief ?? null,
    silences,
  };
}
