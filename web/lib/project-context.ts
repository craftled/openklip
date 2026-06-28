import type { Project } from "@engine/edl";
import type { ProjectSummary } from "@engine/summary";
import { summarize } from "@engine/summary";

export interface ProjectStatsInput {
  assets: unknown[];
  broll: unknown[];
  durationSamples: number;
  padMs: number;
  sampleRate: number;
  slug: string;
  source: string;
  titles?: unknown[];
  words: Array<{
    deleted?: boolean;
    endSample: number;
    startSample: number;
  }>;
  zooms?: unknown[];
}

export interface ProjectHoverContext {
  dirPath: string;
  slug: string;
  source: string;
  summary: ProjectSummary;
}

export function buildProjectHoverContext(
  project: ProjectStatsInput,
  dirPath: string
): ProjectHoverContext {
  return {
    slug: project.slug,
    source: project.source,
    dirPath,
    summary: summarize(project as Project),
  };
}

export function basenamePath(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

export function formatDurationSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
