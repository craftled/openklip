"use server";

// Agent-driven edits. Picks up the model chosen in the GUI selector and drives
// the user's Claude subscription (via `claude -p`) to suggest + apply cuts on
// the same project.json the editor reads. No API keys. Kept in its own file so
// it doesn't touch the hand-written action surface.
import { detectAgents, runFillerAgent } from "@engine/agent-driver";
import { mutateProject } from "@engine/projectStore";

// Re-export the type from source (type-only, never emits runtime code) so client
// components import it from here without pulling the server-only driver into their
// bundle. The return type of getAgentStatuses is inferred from detectAgents.
export type { AgentStatus } from "@engine/agent-driver";

// Probe which agent CLIs are installed + signed in, for the selector badges.
export async function getAgentStatuses() {
  return await detectAgents();
}

export type AgentResult =
  | {
      ok: true;
      cut: number;
      words: Array<{ id: string; text: string }>;
    }
  | { ok: false; error: string };

// Ask the selected agent which transcript words are filler, then mark them
// deleted on the EDL and save. `agent` is the GUI selector value (claude-opus-4-8,
// gpt-5-5, composer-2-5, grok-build). Returns what it cut so the GUI can refresh.
export async function suggestFillerCuts(
  slug: string,
  agent: string
): Promise<AgentResult> {
  try {
    // Hold the project lock across the agent run + apply + save so two
    // concurrent suggestions on the same project can't both load the same
    // baseline and clobber each other's cuts. Chats use a separate lock, so
    // chat writes stay responsive while this runs.
    const cutWords = await mutateProject(slug, async (project) => {
      const { ids } = await runFillerAgent(
        project.words.map((w) => ({ id: w.id, text: w.text })),
        { agent }
      );
      const set = new Set(ids);
      const cut: Array<{ id: string; text: string }> = [];
      for (const w of project.words) {
        if (set.has(w.id) && !w.deleted) {
          w.deleted = true;
          cut.push({ id: w.id, text: w.text });
        }
      }
      return cut;
    });
    return { ok: true, cut: cutWords.length, words: cutWords };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
