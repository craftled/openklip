// Per-project brief.md: free-form markdown context (audience, goal, tone,
// must-use assets, avoid list, target length, export formats) that agents
// automatically receive alongside the transcript. No enforced schema : it's a
// human-editable note next to project.json at the project root, not a derived
// artifact under working/. Pure Node fs (no Bun globals) so this runs under
// the Next server as well as the CLI/MCP surfaces.
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { projectPaths } from "./paths.ts";
import { withBriefLock } from "./project-lock.ts";

// "100KB" as bytes, not decimal kilobytes, matching the disk-usage sense of
// the cap.
const MAX_BYTES = 100 * 1024;

export function briefPath(slug: string): string {
  return projectPaths(slug).brief;
}

// Missing file -> undefined. Whitespace-only content also reads as undefined
// so callers never have to special-case a blank brief.
export async function loadBrief(slug: string): Promise<string | undefined> {
  const fp = briefPath(slug);
  if (!existsSync(fp)) {
    return;
  }
  let raw: string;
  try {
    raw = await readFile(fp, "utf8");
  } catch {
    return;
  }
  const trimmed = raw.trim();
  return trimmed || undefined;
}

// Atomic write: tmp + rename (same pattern as saveProjectChats in chats.ts),
// so a crash mid-write leaves brief.md intact rather than truncated. Empty or
// whitespace-only text DELETES brief.md : a cleared brief removes the file
// instead of leaving an empty one behind.
//
// The whole read-check-write runs inside withBriefLock: without it, two
// overlapping saves for the same slug (e.g. a double-click, or the GUI save
// racing an agent's brief_set call) both write to the SAME
// `${fp}.tmp-${process.pid}` tmp path (same process, same pid) and can
// clobber each other's rename. Serializing per slug makes each save fully
// complete (write + rename) before the next one starts.
export function saveBrief(slug: string, text: string): Promise<void> {
  return withBriefLock(slug, async () => {
    const fp = briefPath(slug);
    const trimmed = text.trim();
    if (!trimmed) {
      try {
        await unlink(fp);
      } catch {
        // Already absent : nothing to delete.
      }
      return;
    }
    if (Buffer.byteLength(trimmed, "utf8") > MAX_BYTES) {
      throw new Error(
        `brief.md exceeds the 100KB cap (${MAX_BYTES} bytes) : trim it before saving`
      );
    }
    // Normalize to a single trailing newline regardless of input.
    const normalized = `${trimmed}\n`;
    await mkdir(dirname(fp), { recursive: true });
    const tmp = `${fp}.tmp-${process.pid}`;
    await writeFile(tmp, normalized, "utf8");
    await rename(tmp, fp);
  });
}
