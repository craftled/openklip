import { existsSync } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import {
  assertValidSlug,
  projectDir,
  projectPaths,
  projectsRoot,
} from "./paths.ts";
import { withProjectLock } from "./project-lock.ts";

export interface CompactProjectResult {
  bytesFreed: number;
  removed: string[];
}

// Recursively sum the byte size of a file or directory. Missing paths cost
// nothing (a project may never have built frames/, moment-index.json, etc.).
async function du(path: string): Promise<number> {
  let total = 0;
  const info = await stat(path).catch(() => null);
  if (!info) {
    return 0;
  }
  if (info.isFile()) {
    return info.size;
  }
  if (info.isDirectory()) {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      total += await du(`${path}/${entry.name}`);
    }
    return total;
  }
  return 0;
}

/**
 * Delete regenerable derived media for a project to reclaim disk, keeping
 * the source video, the edit (project.json), the brief, user assets, and
 * every user-edit-class working/ file (chats.json, tasks.json,
 * actions.jsonl, silences-jobs.json, history/). Playback breaks until
 * rebuildProjectMedia (src/rebuild-project.ts) restores the proxy and
 * frames: app/media/proxy.mp4/route.ts and app/media/frames/[name]/route.ts
 * 404 on a missing file rather than lazily rebuilding it.
 */
export async function compactProject(
  slug: string
): Promise<CompactProjectResult> {
  const safeSlug = assertValidSlug(slug);
  const dir = resolve(projectDir(safeSlug));
  const root = resolve(projectsRoot());
  if (dir !== root && !dir.startsWith(`${root}${sep}`)) {
    throw new Error(`invalid project path: ${JSON.stringify(slug)}`);
  }

  return await withProjectLock(safeSlug, async () => {
    const p = projectPaths(safeSlug);
    if (!existsSync(p.project)) {
      throw new Error(`project not found: ${safeSlug}`);
    }

    // Regenerable-only. Never includes project.json, brief.md, assets/,
    // working/history, chats.json, tasks.json, actions.jsonl,
    // silences-jobs.json, takes/, or cams/ (see src/paths.ts's
    // projectPaths doc for why those are irreplaceable/user-edit-class).
    const candidates = [
      p.proxy,
      p.audioRaw,
      p.frames,
      p.momentIndex,
      p.transcript,
      `${p.working}/audio-analysis.json`,
      p.output,
    ];

    let bytesFreed = 0;
    const removed: string[] = [];
    for (const target of candidates) {
      const size = await du(target);
      if (size === 0 && !existsSync(target)) {
        continue;
      }
      await rm(target, { recursive: true, force: true });
      bytesFreed += size;
      removed.push(target);
    }

    return { bytesFreed, removed };
  });
}
