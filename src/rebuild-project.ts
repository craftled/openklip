import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { IngestMediaDeps } from "./ingest.ts";
import { runIngestMediaPhases } from "./ingest.ts";
import type { IngestProgress } from "./ingest-types.ts";
import { assertValidSlug, projectPaths } from "./paths.ts";
import { loadProject } from "./projectStore.ts";

export interface RebuildProjectMediaOpts {
  /** Test-only override for the media pipeline (see IngestMediaDeps). */
  mediaDeps?: Partial<IngestMediaDeps>;
  onProgress?: (p: IngestProgress) => void;
  signal?: AbortSignal;
}

/**
 * Rehydrate a compacted project: re-run the proxy/audio/frames/moment-index/
 * transcribe pipeline against project.json's `source` and rewrite the
 * regenerable working/ artifacts compactProject deletes. Never touches
 * project.json itself (the edit: words, revision, template, ...) so a
 * compact -> rebuild round trip leaves the edit untouched. Safe to call on a
 * project that was never compacted (re-derives the same cache files).
 */
export async function rebuildProjectMedia(
  slug: string,
  opts?: RebuildProjectMediaOpts
): Promise<void> {
  const safeSlug = assertValidSlug(slug);
  const p = projectPaths(safeSlug);
  if (!existsSync(p.project)) {
    throw new Error(`project not found: ${safeSlug}`);
  }

  const project = await loadProject(safeSlug);
  if (!existsSync(project.source)) {
    throw new Error(
      `source video not found: ${project.source}. Move it back and retry, or re-ingest.`
    );
  }

  await mkdir(p.working, { recursive: true });
  await mkdir(p.frames, { recursive: true });
  await mkdir(p.output, { recursive: true });

  const words = await runIngestMediaPhases({
    source: project.source,
    slug: safeSlug,
    paths: {
      proxy: p.proxy,
      audioRaw: p.audioRaw,
      frames: p.frames,
      transcriptRawJson: `${p.working}/transcript.raw.json`,
    },
    deps: opts?.mediaDeps,
    signal: opts?.signal,
    emit: (phase) => {
      if (!opts?.onProgress) {
        return;
      }
      opts.onProgress({
        phase,
        message: `Rebuilding: ${phase}`,
        step: 1,
        total: 1,
      });
    },
  });

  await Bun.write(p.transcript, JSON.stringify({ words }, null, 2));
}
