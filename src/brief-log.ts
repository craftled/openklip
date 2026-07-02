// Shared best-effort action-history entry for brief.md writes. brief.md is
// not part of project.json, so setting it never goes through mutateProject:
// every surface that can write the brief (MCP brief_set, CLI `brief --set`,
// the GUI saveBrief server action) instead calls this helper directly after
// its own save, so `openklip history <slug>` shows brief edits the same way
// regardless of which surface made them. The entry's revisionBefore equals
// revisionAfter: the brief isn't part of the EDL, so writing it never bumps
// the project revision.
import { type Actor, appendActionLog, summarizeForLog } from "./action-log.ts";
import { loadProject } from "./projectStore.ts";

export async function logBriefSet(
  slug: string,
  actor: Actor,
  text: string,
  taskId?: string
): Promise<void> {
  const chars = text.trim().length;
  try {
    const project = await loadProject(slug);
    const revision = project.revision ?? 0;
    await appendActionLog(slug, {
      at: Date.now(),
      action: "brief-set",
      actor,
      input: summarizeForLog({ chars }),
      revisionBefore: revision,
      revisionAfter: revision,
      taskId,
    });
  } catch {
    // Best-effort: a history-log failure must not fail the brief write.
  }
}
