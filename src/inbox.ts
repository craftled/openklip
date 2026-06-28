// Folder-watch ingest: loose video files sitting directly in the projects root
// (not inside a project dir) are an "inbox". Dropping a video there and it
// auto-becomes a project is the hands-off UX (the deck's raw-folder → cut).
//
// Watching the projects root itself (rather than moving files into a project)
// keeps the source path valid : the exporter reads project.source for full-res
// renders and falls back to the proxy only when source is gone. Re-detection is
// just "does the slug's project dir exist yet", so nothing is ingested twice.
//
// listInboxVideos is pure (filenames + existing slugs → pending) and unit
// tested; scanInboxRoot is the filesystem wrapper.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { projectsRoot, slugFromVideo } from "./paths.ts";
import { listProjects } from "./projectStore.ts";

const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);

export interface InboxVideo {
  /** Filename of the loose video in the projects root. */
  file: string;
  /** Slug it would ingest into. */
  slug: string;
}

// Pure: given the filenames directly under the projects root and the slugs that
// already have a project, return the loose videos still waiting to be ingested.
export function listInboxVideos(
  fileNames: string[],
  existingSlugs: Iterable<string>
): InboxVideo[] {
  const existing = new Set(existingSlugs);
  const seen = new Set<string>();
  const out: InboxVideo[] = [];
  for (const name of fileNames) {
    if (name.startsWith(".")) {
      continue;
    }
    const dot = name.lastIndexOf(".");
    const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
    if (!VIDEO_EXT.has(ext)) {
      continue;
    }
    const slug = slugFromVideo(name);
    // Skip videos whose project already exists, and de-dupe two files that
    // would collide on the same slug (only the first wins).
    if (existing.has(slug) || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    out.push({ file: name, slug });
  }
  return out;
}

// Filesystem wrapper: the loose videos in the projects root not yet ingested.
export function scanInboxRoot(): InboxVideo[] {
  const root = projectsRoot();
  if (!existsSync(root)) {
    return [];
  }
  const fileNames = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name);
  const slugs = listProjects().map((p) => p.slug);
  return listInboxVideos(fileNames, slugs);
}

// Absolute path of a detected inbox video.
export function inboxVideoPath(file: string): string {
  return join(projectsRoot(), file);
}
