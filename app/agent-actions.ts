"use server";

// Agent-driven edits. Picks up the model chosen in the GUI selector and drives
// the user's Claude subscription (via `claude -p`) to suggest + apply cuts on
// the same project.json the editor reads. No API keys. Kept in its own file so
// it doesn't touch the hand-written action surface.
import {
  buildChatPrompt,
  buildEditPrompt,
  detectAgents,
  runAgentText,
  runClaudeEdit,
  runFillerAgent,
  supportsToolEditing,
} from "@engine/agent-driver";
import {
  completeAgentTask,
  createAgentTask,
  getAgentTask,
} from "@engine/agent-tasks";
import { analyzeAssets, assetCardLines } from "@engine/asset-cards";
import { loadBrief } from "@engine/brief";
import type { Project } from "@engine/edl";
import { projectsRoot } from "@engine/paths";
import { loadProject, mutateProject } from "@engine/projectStore";
import { cwdPath } from "@engine/repo-paths";
import { analyzeSceneLog, sceneLogLines } from "@engine/scene-log";
import { type VerifyReport, verifyCut, verifyVerdict } from "@engine/verify";

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
    const cutWords = await mutateProject(
      slug,
      async (project) => {
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
      },
      { action: "filler-cuts", actor: "agent", input: { agent } }
    );
    return { ok: true, cut: cutWords.length, words: cutWords };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type AnalyzeReply =
  | {
      ok: true;
      analyzed: number;
      skipped: number;
      total: number;
      sceneLogged: boolean;
    }
  | { ok: false; error: string };

// One "understand my media" pass: fan out one subagent per un-described asset
// (b-roll, stills) to write an "asset card", and, if the main video has no scene
// log yet, run one subagent over its frames to log what is on screen. The
// editing agent then places media by meaning and targets b-roll opportunities.
// `agent` is the GUI selector value. Idempotent: only missing work runs.
export async function analyzeProjectAssets(
  slug: string,
  agent: string
): Promise<AnalyzeReply> {
  try {
    const res = await analyzeAssets(
      slug,
      { agent },
      {
        loadProject,
        // Attribute the asset-card write to the agent in the action history.
        mutateProject: <T>(
          s: string,
          fn: (project: Project) => T | Promise<T>
        ) =>
          mutateProject(s, fn, {
            action: "asset-cards",
            actor: "agent",
            input: { agent },
          }),
      }
    );
    const sceneLogged = await analyzeProjectSceneLog(slug, agent);
    return {
      ok: true,
      analyzed: res.analyzed.length,
      skipped: res.skipped.length,
      total: res.total,
      sceneLogged,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Generate the main-video scene log when absent. Best-effort and read-then-write
// outside the asset lock; returns whether a log was produced this run.
async function analyzeProjectSceneLog(
  slug: string,
  agent: string
): Promise<boolean> {
  const project = await loadProject(slug);
  if (project.sceneLog) {
    return false;
  }
  const log = await analyzeSceneLog(slug, project, { agent });
  if (!log) {
    return false;
  }
  await mutateProject(
    slug,
    (proj) => {
      if (!proj.sceneLog) {
        proj.sceneLog = log;
      }
    },
    { action: "scene-log", actor: "agent", input: { agent } }
  );
  return true;
}

export type VerifyReply =
  | { ok: true; report: VerifyReport; verdict: string }
  | { ok: false; error: string };

// The verify loop: re-transcribe the rendered cut (output/out.mp4) and check it
// against the EDL. Read-only; requires an export to exist. Returns the report
// and a one-line verdict for the toast.
export async function verifyProjectCut(slug: string): Promise<VerifyReply> {
  try {
    const report = await verifyCut(slug);
    return { ok: true, report, verdict: verifyVerdict(report) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type ChatReply =
  | { ok: true; edited: boolean; text: string }
  | { ok: false; error: string };

// Free-text chat. For tool-capable agents (Claude) the model is given the
// openklip MCP tools and DOES the edit the user asked for, replying with a
// short confirmation; `edited` tells the GUI to refresh the project. Other
// agents fall back to a read-only text answer. `agent` is the GUI selector
// value (claude-opus-4-8, gpt-5-5, composer-2-5, grok-build).
export async function chatWithAgent(
  slug: string,
  agent: string,
  message: string,
  opts?: { threadId?: string }
): Promise<ChatReply> {
  try {
    const project = await loadProject(slug);
    const assetCards = assetCardLines(project.assets);
    const sceneLog = sceneLogLines(project.sceneLog);
    const brief = await loadBrief(slug);
    if (supportsToolEditing(agent)) {
      // Every tool-editing run gets a visible agent task: the run reports its
      // own progress via task_step / task_complete (id threaded through the
      // MCP env), and the finally-style fallbacks below keep the task honest
      // when the agent exits without signaling completion.
      const task = await createAgentTask(slug, {
        request: message,
        ...(opts?.threadId ? { chatId: opts.threadId } : {}),
      });
      const prompt = buildEditPrompt(
        {
          words: project.words,
          template: project.template,
          assetCards,
          sceneLog,
          brief,
        },
        slug,
        message,
        { taskProgress: true }
      );
      let text: string;
      try {
        ({ text } = await runClaudeEdit(prompt, {
          agent,
          slug,
          projectsRoot: projectsRoot(),
          mcpServerPath: cwdPath("src", "mcp-server.ts"),
          taskId: task.id,
          // Draft workflows legitimately run long (cut + overlays + music +
          // export + whisper verify); a tight budget kills them mid-verify.
          // The task panel's cancel button is the user's control, so err long.
          timeoutMs: 900_000,
        }));
      } catch (e) {
        // A user cancel kills the process tree, which surfaces here as a
        // spawn failure ("claude failed (exit 143): no output"). Check the
        // stored status FIRST: when the task is already cancelled, reply
        // with a friendly line instead of the raw error, and skip
        // completeAgentTask entirely (its terminal no-op would preserve the
        // cancelled status anyway, but there is nothing to record).
        const current = await getAgentTask(slug, task.id);
        if (current?.status === "cancelled") {
          return {
            ok: true,
            edited: true,
            text: "Cancelled. Edits made before the cancel are still applied.",
          };
        }
        // completeAgentTask is a no-op on terminal tasks, so an
        // agent-reported blocked/failed state wins over this fallback.
        await completeAgentTask(slug, task.id, {
          kind: "failed",
          error: (e as Error).message,
        });
        throw e;
      }
      await completeAgentTask(slug, task.id, {
        kind: "completed",
        summary: text.trim().slice(0, 500) || undefined,
      });
      return { ok: true, edited: true, text: text.trim() || "(done)" };
    }
    const prompt = buildChatPrompt(
      {
        words: project.words,
        template: project.template,
        assetCards,
        sceneLog,
        brief,
      },
      message
    );
    const { text } = await runAgentText(prompt, { agent });
    return { ok: true, edited: false, text: text.trim() || "(no response)" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
