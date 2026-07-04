// Unified agent tool registry: query reads, registry mutations, and lifecycle
// commands in one manifest. CLI (`openklip tools`), MCP (stdio server), and docs
// all read from here so surfaces stay in sync with the GUI's project.json edits.
import { z } from "zod";
import { type Actor, actorFromEnv, readActionLog } from "./action-log.ts";
import { matchesAuthorFilter } from "./provenance.ts";
import {
  type AgentTaskOutcome,
  type AgentTaskStatus,
  completeAgentTask,
  listAgentTasks,
  setAgentTaskStep,
} from "./agent-tasks.ts";
import { assembleFromSelection, listTakes, loadTake } from "./assembly.ts";
import { loadAudioAnalysis } from "./audio-analysis.ts";
import type { SilenceSpan } from "./audio-analysis-core.ts";
import { loadBrief, saveBrief } from "./brief.ts";
import { logBriefSet } from "./brief-log.ts";
import { cleanupReport, fillerOnlyCleanupReport } from "./cleanup.ts";
import { type Project, samplesToSec } from "./edl.ts";
import { EXPORT_PLATFORM_IDS } from "./export-platforms.ts";
import {
  EXPORT_COMPRESSIONS,
  EXPORT_FORMATS,
  exportCut,
  GIF_MAX_WIDTH_OVERRIDE_CEILING_PX,
} from "./exporter.ts";
import { listGraphics } from "./graphics.ts";
import { listLuts } from "./lut.ts";
import {
  listHistorySnapshotRevisions,
  listProjects,
  loadProject,
  mutateProject,
} from "./projectStore.ts";
import {
  grepTranscript,
  listOverlays,
  listRanges,
  phraseSpan,
  projectStatus,
  wordSpan,
} from "./query.ts";
import { placeFromPhrase } from "./reanchor.ts";
import {
  type ActionDef,
  actions,
  runAction,
  type Surface,
} from "./registry.ts";
import { type RevertTarget, revertProject } from "./revert.ts";
import {
  applyProjectTemplate,
  listTemplates,
  loadTemplateSkill,
} from "./templates.ts";
import { verifyCut, verifyVerdict } from "./verify.ts";

const slug = z.string().min(1).describe("Project slug under projects/");

// Mirrors AgentTaskStatus in src/agent-task-types.ts; kept as a local literal
// tuple (rather than exporting the private TASK_STATUSES there) since z.enum
// needs a compile-time tuple, not a string[]. Exported so the CLI's `tasks
// --status` filter (src/cli.ts) validates against the same canonical list as
// this MCP tool's schema (Finding 5).
export const AGENT_TASK_STATUSES = [
  "pending",
  "running",
  "blocked",
  "failed",
  "completed",
  "cancelled",
] as const satisfies readonly AgentTaskStatus[];

// Mirrors Actor in src/action-log-entry.ts; kept as a local literal tuple
// (rather than exporting a private array there) since z.enum needs a
// compile-time tuple, not a string[]. Unlike action-log.ts's ACTORS (which
// deliberately excludes "system", a value never set via OPENKLIP_ACTOR), this
// list covers every Actor member so the history_list `actor` filter can match
// any logged entry, including background-maintenance ones.
export const HISTORY_ACTORS = [
  "human",
  "agent",
  "cli",
  "mcp",
  "system",
] as const satisfies readonly Actor[];

export interface AgentToolDef {
  name: string;
  run: (input: unknown) => Promise<unknown>;
  schema: z.ZodType;
  summary: string;
  surfaces: Surface[];
  /** Flat Zod shape for MCP registerTool inputSchema. */
  zodShape: Record<string, z.ZodType>;
}

function toolSchemaWithSlug(actionSchema: z.ZodType): z.ZodType {
  if (actionSchema instanceof z.ZodObject) {
    return z.object({ slug }).merge(actionSchema);
  }
  return z.object({ slug });
}

function zodShapeFromSchema(schema: z.ZodType): Record<string, z.ZodType> {
  const merged =
    schema instanceof z.ZodObject
      ? schema
      : z.object({ slug: z.string().min(1) });
  return merged.shape as Record<string, z.ZodType>;
}

// These tools mostly run inside the MCP stdio server, so mutations default to
// actor "mcp". The agent chat path sets OPENKLIP_ACTOR=agent on the spawned
// server so its edits attribute to the agent instead.
function toolActor(): Actor {
  return actorFromEnv() ?? "mcp";
}

// Threads OPENKLIP_TASK_ID (set by the agent-task spawner, see
// activeTaskIdFromEnv below) onto logged mutations so history entries link
// back to the task that produced them. Undefined for direct MCP/CLI calls
// that aren't running as part of a spawned task.
function toolTaskId(): string | undefined {
  const id = process.env.OPENKLIP_TASK_ID?.trim();
  return id ? id : undefined;
}

function scopedProjectSlug(): string | undefined {
  const scoped = process.env.OPENKLIP_SLUG?.trim();
  return scoped ? scoped : undefined;
}

// task_step/task_complete read the active task id from OPENKLIP_TASK_ID (set
// by the spawner on the running agent's environment), never from tool input.
// This mirrors the OPENKLIP_SLUG scoping above: an agent process can only
// ever report progress on the one task it was spawned for.
function activeTaskIdFromEnv(): string {
  const id = process.env.OPENKLIP_TASK_ID?.trim();
  if (!id) {
    throw new Error(
      "no active task for this session (OPENKLIP_TASK_ID is not set)"
    );
  }
  return id;
}

function rawInputSlug(rawInput: unknown): string | undefined {
  if (
    typeof rawInput !== "object" ||
    rawInput === null ||
    Array.isArray(rawInput)
  ) {
    return;
  }
  const maybeSlug = (rawInput as { slug?: unknown }).slug;
  return typeof maybeSlug === "string" ? maybeSlug : undefined;
}

function assertScopedProjectInput({
  hasSlugInput,
  rawInput,
  toolName,
}: {
  hasSlugInput: boolean;
  rawInput: unknown;
  toolName: string;
}): void {
  const scoped = scopedProjectSlug();
  if (!scoped) {
    return;
  }
  const inputSlug = rawInputSlug(rawInput);
  if (!hasSlugInput && inputSlug === undefined) {
    return;
  }
  if (inputSlug === scoped) {
    return;
  }
  if (inputSlug === undefined) {
    throw new Error(
      `tool "${toolName}" is scoped to project "${scoped}" and requires a slug`
    );
  }
  throw new Error(
    `tool "${toolName}" is scoped to project "${scoped}" and cannot access project "${inputSlug}"`
  );
}

function mutationTool(action: ActionDef): AgentToolDef {
  const schema = toolSchemaWithSlug(action.schema);
  return {
    name: action.name,
    summary: action.summary,
    surfaces: action.surfaces,
    schema,
    zodShape: zodShapeFromSchema(schema),
    run: (raw) => {
      const input = schema.parse(raw) as { slug: string } & Record<
        string,
        unknown
      >;
      const { slug: projectSlug, ...actionInput } = input;
      return mutateProject(
        projectSlug,
        (project) => runAction(action.name, project, actionInput),
        {
          action: action.name,
          actor: toolActor(),
          input: actionInput,
          taskId: toolTaskId(),
        }
      );
    },
  };
}

function defineQueryTool<S extends z.ZodRawShape>(def: {
  name: string;
  summary: string;
  schema: z.ZodObject<S>;
  surfaces?: Surface[];
  run: (input: z.infer<z.ZodObject<S>>) => Promise<unknown> | unknown;
}): AgentToolDef {
  return {
    name: def.name,
    summary: def.summary,
    surfaces: def.surfaces ?? ["mcp", "cli"],
    schema: def.schema,
    zodShape: def.schema.shape as unknown as Record<string, z.ZodType>,
    run: async (raw) => def.run(def.schema.parse(raw)),
  };
}

// F1: project_status and project_ranges both need `silences` to agree with
// the CLI/exporter timeline (effectiveRanges is a snap no-op without it), but
// loading audio analysis is best-effort everywhere else in this file too (see
// cleanup_report below) - only attempted when snap is actually enabled in VAD
// mode, and swallowed on failure (missing audio16k.f32, corrupt cache, ...)
// so a query tool never fails just because analysis isn't available yet.
async function loadSilences(
  project: Project
): Promise<SilenceSpan[] | undefined> {
  const snap = project.cuts?.snap;
  if (!(snap?.enabled && snap.mode === "vad")) {
    return;
  }
  return await loadAudioAnalysis(project.slug)
    .then((a) => a.silences)
    .catch(() => undefined);
}

const queryTools: AgentToolDef[] = [
  defineQueryTool({
    name: "list_projects",
    summary: "List OpenKlip projects (most recent first).",
    schema: z.object({}),
    run: () => {
      const scoped = scopedProjectSlug();
      const projects = scoped
        ? listProjects().filter((p) => p.slug === scoped)
        : listProjects();
      return {
        projects: projects.map((p) => ({
          slug: p.slug,
          mtimeMs: p.mtimeMs,
        })),
      };
    },
  }),
  defineQueryTool({
    name: "list_assets",
    summary: "List registered media assets for a project.",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const project = await loadProject(projectSlug);
      return {
        assets: project.assets.map((a) => ({
          id: a.id,
          kind: a.kind ?? "broll",
          name: a.name,
          durationSec: samplesToSec(a.durationSamples),
          ...(a.mustUse === undefined ? {} : { mustUse: a.mustUse }),
          ...(a.avoid === undefined ? {} : { avoid: a.avoid }),
        })),
      };
    },
  }),
  defineQueryTool({
    name: "asset_cards",
    summary:
      "Subagent descriptions of assets (summary, tags, bestFor) for placement.",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const project = await loadProject(projectSlug);
      return {
        cards: project.assets
          .filter((a) => a.card)
          .map((a) => ({
            id: a.id,
            kind: a.kind ?? "broll",
            summary: a.card?.summary,
            tags: a.card?.tags ?? [],
            bestFor: a.card?.bestFor ?? [],
            suggestedFocus: a.card?.suggestedFocus,
          })),
      };
    },
  }),
  defineQueryTool({
    name: "scene_log",
    summary:
      "Subagent visual log of the main video: on-screen spans and b-roll openings.",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const project = await loadProject(projectSlug);
      return { sceneLog: project.sceneLog ?? null };
    },
  }),
  defineQueryTool({
    name: "highlights_list",
    summary:
      "LLM-detected short-form clip candidates (fromSec, toSec, title, score).",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const project = await loadProject(projectSlug);
      return { highlights: project.highlights ?? null };
    },
  }),
  defineQueryTool({
    name: "project_status",
    summary: "Agent-friendly edit summary (words, ranges, overlays, look).",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const project = await loadProject(projectSlug);
      const silences = await loadSilences(project);
      return projectStatus(project, silences);
    },
  }),
  defineQueryTool({
    name: "project_ranges",
    summary: "Kept source-time segments after cuts and pad.",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const project = await loadProject(projectSlug);
      const silences = await loadSilences(project);
      return { ranges: listRanges(project, silences) };
    },
  }),
  defineQueryTool({
    name: "project_overlays",
    summary: "All b-roll, titles, zooms, and stills with ids and spans.",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const project = await loadProject(projectSlug);
      return listOverlays(project);
    },
  }),
  defineQueryTool({
    name: "history_list",
    summary:
      "Action history log entries (newest first) plus which revisions have a revert snapshot. Mirrors the GUI History panel.",
    schema: z.object({
      slug,
      limit: z.number().int().positive().max(200).default(50),
      task: z
        .string()
        .min(1)
        .optional()
        .describe("Filter to entries logged under this agent task id."),
      action: z
        .string()
        .min(1)
        .optional()
        .describe("Filter to entries with this action name."),
      actor: z
        .enum(HISTORY_ACTORS)
        .optional()
        .describe(
          "Filter to entries logged by this actor (human, agent, cli, mcp, or system)."
        ),
      author: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Filter to entries whose authorId or model contains this substring."
        ),
      model: z
        .string()
        .min(1)
        .optional()
        .describe("Filter to entries with this exact model slug."),
    }),
    run: async ({
      slug: projectSlug,
      limit,
      task,
      action,
      actor,
      author,
      model,
    }) => {
      let entries = await readActionLog(projectSlug);
      if (task !== undefined) {
        entries = entries.filter((e) => e.taskId === task);
      }
      if (action !== undefined) {
        entries = entries.filter((e) => e.action === action);
      }
      if (actor !== undefined) {
        entries = entries.filter((e) => e.actor === actor);
      }
      if (author !== undefined) {
        entries = entries.filter((e) => matchesAuthorFilter(e, author));
      }
      if (model !== undefined) {
        entries = entries.filter((e) => e.model === model);
      }
      return {
        entries: entries.slice(0, limit),
        snapshotRevisions: listHistorySnapshotRevisions(projectSlug),
      };
    },
  }),
  defineQueryTool({
    name: "task_list",
    summary:
      "Agent task records (newest first): request, status, steps, and completion summary.",
    schema: z.object({
      slug,
      limit: z.number().int().positive().max(100).default(20),
      status: z.enum(AGENT_TASK_STATUSES).optional(),
      actor: z
        .enum(HISTORY_ACTORS)
        .optional()
        .describe(
          "Filter to tasks created by this actor (human, agent, cli, mcp, or system)."
        ),
    }),
    run: async ({ slug: projectSlug, limit, status, actor }) => {
      // The store has no status/actor filter, so when either is requested we
      // fetch beyond the store's own default limit, filter, THEN cap to the
      // caller's limit: filtering after an already-limited fetch could
      // silently return fewer matches than actually exist.
      const tasks = await listAgentTasks(projectSlug, {
        limit:
          status === undefined && actor === undefined
            ? limit
            : Number.MAX_SAFE_INTEGER,
      });
      let filtered = tasks;
      if (status !== undefined) {
        filtered = filtered.filter((t) => t.status === status);
      }
      if (actor !== undefined) {
        filtered = filtered.filter((t) => t.actor === actor);
      }
      return { tasks: filtered.slice(0, limit) };
    },
  }),
  defineQueryTool({
    name: "cleanup_report",
    summary:
      "Filler-word and dead-air candidates with savings estimates and safe/review risk. Apply the safe ones with the cut action (filler wordIds) and the dead-air-add action (spans); leave review candidates to a human unless the brief says aggressive.",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const project = await loadProject(projectSlug);
      try {
        const analysis = await loadAudioAnalysis(projectSlug);
        return cleanupReport(project, analysis.silences);
      } catch {
        // No audio analysis yet (project never re-ingested since
        // audio16k.f32 was introduced): degrade to filler-only.
        return fillerOnlyCleanupReport(project);
      }
    },
  }),
  defineQueryTool({
    name: "transcript_grep",
    summary: "Find phrase runs in the transcript (word ids and seconds).",
    schema: z.object({
      slug,
      phrase: z.string().min(1),
      all: z.boolean().default(false),
    }),
    run: async ({ slug: projectSlug, phrase, all }) => {
      const project = await loadProject(projectSlug);
      return grepTranscript(project, phrase, { all });
    },
  }),
  defineQueryTool({
    name: "transcript_span",
    summary: "Slice transcript words around word ids (w12 or w12-w20).",
    schema: z.object({
      slug,
      token: z.string().min(1),
      context: z.number().int().nonnegative().default(0),
    }),
    run: async ({ slug: projectSlug, token, context }) => {
      const project = await loadProject(projectSlug);
      return wordSpan(project, token, { context });
    },
  }),
  defineQueryTool({
    name: "transcript_phrase",
    summary: "First phrase match span for overlay placement.",
    schema: z.object({ slug, phrase: z.string().min(1) }),
    run: async ({ slug: projectSlug, phrase }) => {
      const project = await loadProject(projectSlug);
      return { phrase, ...phraseSpan(project, phrase) };
    },
  }),
  defineQueryTool({
    name: "transcript_list",
    summary: "Full transcript as JSON (prefer transcript_grep on long videos).",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const project = await loadProject(projectSlug);
      return {
        words: project.words.map((w, index) => ({
          index,
          id: w.id,
          text: w.text,
          startSec: samplesToSec(w.startSample),
          endSec: samplesToSec(w.endSample),
          deleted: w.deleted,
          ...(w.note === undefined ? {} : { note: w.note }),
        })),
        total: project.words.length,
        cut: project.words.filter((w) => w.deleted).length,
      };
    },
  }),
  defineQueryTool({
    name: "template_list",
    summary: "List edit templates (templates/*/skill.md).",
    schema: z.object({}),
    run: () => ({ templates: listTemplates() }),
  }),
  defineQueryTool({
    name: "luts",
    summary: "List available .cube LUTs (luts/) for look-lut.",
    schema: z.object({}),
    run: () => ({ luts: listLuts() }),
  }),
  defineQueryTool({
    name: "graphic_list",
    summary: "List available graphic templates (graphics/*/manifest.json).",
    schema: z.object({}),
    run: () => ({ graphics: listGraphics() }),
  }),
  defineQueryTool({
    name: "template_show",
    summary: "Load an edit template skill file on demand.",
    schema: z.object({ id: z.string().min(1) }),
    run: ({ id }) => ({ id, skill: loadTemplateSkill(id) }),
  }),
  defineQueryTool({
    name: "load_skill",
    summary:
      "Load a skill's full procedure (markdown) by id when the user's request matches that skill. Read-only; does not change the project template.",
    schema: z.object({ id: z.string().min(1) }),
    surfaces: ["cli", "mcp"],
    run: ({ id }) => ({ id, skill: loadTemplateSkill(id) }),
  }),
  defineQueryTool({
    name: "template_set",
    summary: "Attach a template id to project.json.",
    schema: z.object({ slug, id: z.string().min(1) }),
    run: async ({ slug: projectSlug, id }) =>
      mutateProject(
        projectSlug,
        (project) => {
          applyProjectTemplate(project, id);
          return { template: project.template };
        },
        // Logged as "template-set": history action names are hyphenated even
        // though the MCP tool itself keeps its underscored name.
        { action: "template-set", actor: toolActor(), input: { id } }
      ),
  }),
  defineQueryTool({
    name: "brief_get",
    summary:
      "Read the project brief.md (audience, goal, tone, must-use assets, avoid list, target length, export formats).",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const brief = await loadBrief(projectSlug);
      return { brief: brief ?? null };
    },
  }),
  defineQueryTool({
    name: "brief_set",
    summary:
      "Write the project brief.md (free-form markdown, no enforced schema).",
    schema: z.object({ slug, text: z.string().max(20_000) }),
    // Not a project.json mutation, so mutateProject doesn't apply here: this
    // writes brief.md directly via src/brief.ts. The write IS logged to
    // working/actions.jsonl (best-effort): the brief is standing instructions
    // every future prompt receives, so an agent modifying it must be visible
    // in the action history. It doesn't bump the project revision (brief.md
    // is not part of the EDL), hence revisionBefore === revisionAfter.
    run: async ({ slug: projectSlug, text }) => {
      await saveBrief(projectSlug, text);
      await logBriefSet(projectSlug, toolActor(), text, toolTaskId());
      return { saved: true, chars: text.trim().length };
    },
  }),
  defineQueryTool({
    name: "task_step",
    summary:
      "Report progress on the running agent's own task: marks the prior step done and starts a new one.",
    schema: z.object({
      slug,
      title: z.string().min(1).max(200),
      note: z.string().max(500).optional(),
    }),
    surfaces: ["mcp"],
    run: async ({ slug: projectSlug, title, note }) => {
      const taskId = activeTaskIdFromEnv();
      const task = await setAgentTaskStep(projectSlug, taskId, {
        title,
        ...(note === undefined ? {} : { note }),
      });
      if (!task) {
        throw new Error(
          `no active task for this session (task ${taskId} was not found or has already finished)`
        );
      }
      return { task };
    },
  }),
  defineQueryTool({
    name: "task_complete",
    summary:
      "Signal the running agent's own task is done, blocked on a question, or partially done with remaining work.",
    schema: z.object({
      slug,
      outcome: z.enum(["completed", "blocked", "partial"]),
      summary: z.string().max(2000).optional(),
      question: z.string().max(1000).optional(),
      remaining: z.array(z.string().max(300)).max(20).optional(),
    }),
    surfaces: ["mcp"],
    run: async ({
      slug: projectSlug,
      outcome,
      summary,
      question,
      remaining,
    }) => {
      const taskId = activeTaskIdFromEnv();

      let mapped: AgentTaskOutcome;
      if (outcome === "blocked") {
        if (!question) {
          throw new Error(
            'task_complete outcome "blocked" requires a question'
          );
        }
        mapped = { kind: "blocked", question };
      } else {
        // "completed" and "partial" both resolve the task as completed; the
        // agent picks "partial" to also record what work is left (remaining).
        mapped = {
          kind: "completed",
          ...(summary === undefined ? {} : { summary }),
          ...(remaining === undefined ? {} : { remaining }),
        };
      }

      const task = await completeAgentTask(projectSlug, taskId, mapped);
      if (!task) {
        throw new Error(
          `no active task for this session (task ${taskId} was not found)`
        );
      }
      return { task };
    },
  }),
  defineQueryTool({
    name: "title-add-phrase",
    summary: "Place a title at the first spoken phrase match (min 2s span).",
    schema: z.object({
      slug,
      spokenPhrase: z.string().min(1),
      text: z.string().min(1),
      position: z
        .enum(["lower", "center", "hero", "quote", "divider", "callout"])
        .default("lower"),
      note: z.string().optional(),
    }),
    run: async ({ slug: projectSlug, spokenPhrase, text, position, note }) =>
      mutateProject(
        projectSlug,
        (project) => {
          const span = placeFromPhrase(project, spokenPhrase);
          if (!span.matched) {
            throw new Error(`no match for spoken phrase: "${spokenPhrase}"`);
          }
          return runAction("title-add", project, {
            fromSec: span.fromSec,
            toSec: span.toSec,
            text: text.replace(/\\n/g, "\n"),
            position,
            note,
            anchor: { phrase: spokenPhrase, wordIds: span.ids, stale: false },
          });
        },
        {
          action: "title-add-phrase",
          actor: toolActor(),
          input: { spokenPhrase, text, position, note },
          taskId: toolTaskId(),
        }
      ),
  }),
  defineQueryTool({
    name: "zoom-add-phrase",
    summary: "Push-in zoom at the first spoken phrase match.",
    schema: z.object({
      slug,
      spokenPhrase: z.string().min(1),
      scale: z.number().optional(),
      rampSec: z.number().optional(),
      note: z.string().optional(),
    }),
    run: async ({ slug: projectSlug, spokenPhrase, scale, rampSec, note }) =>
      mutateProject(
        projectSlug,
        (project) => {
          const span = placeFromPhrase(project, spokenPhrase);
          if (!span.matched) {
            throw new Error(`no match for spoken phrase: "${spokenPhrase}"`);
          }
          return runAction("zoom-add", project, {
            fromSec: span.fromSec,
            toSec: span.toSec,
            scale,
            rampSec,
            note,
            anchor: { phrase: spokenPhrase, wordIds: span.ids, stale: false },
          });
        },
        {
          action: "zoom-add-phrase",
          actor: toolActor(),
          input: { spokenPhrase, scale, rampSec, note },
          taskId: toolTaskId(),
        }
      ),
  }),
  defineQueryTool({
    name: "broll-add-phrase",
    summary: "B-roll cover at the first spoken phrase match.",
    schema: z.object({
      slug,
      assetId: z.string().min(1),
      spokenPhrase: z.string().min(1),
      note: z.string().optional(),
    }),
    run: async ({ slug: projectSlug, assetId, spokenPhrase, note }) =>
      mutateProject(
        projectSlug,
        (project) => {
          const span = placeFromPhrase(project, spokenPhrase);
          if (!span.matched) {
            throw new Error(`no match for spoken phrase: "${spokenPhrase}"`);
          }
          return runAction("broll-add", project, {
            assetId,
            fromSec: span.fromSec,
            toSec: span.toSec,
            note,
            anchor: { phrase: spokenPhrase, wordIds: span.ids, stale: false },
          });
        },
        {
          action: "broll-add-phrase",
          actor: toolActor(),
          input: { assetId, spokenPhrase, note },
          taskId: toolTaskId(),
        }
      ),
  }),
  defineQueryTool({
    name: "export",
    summary: "Render the current cut to output/out.mp4.",
    schema: z.object({
      slug,
      aspect: z
        .enum(["source", "16:9", "9:16", "1:1"])
        .optional()
        .describe(
          "Output aspect for this export; defaults to project.export then platform"
        ),
      maxHeight: z.number().int().positive().max(4320).optional(),
      compression: z
        .enum(EXPORT_COMPRESSIONS)
        .optional()
        .describe("Encoder preset; default social (today's settings)"),
      format: z
        .enum(EXPORT_FORMATS)
        .optional()
        .describe("Output container; default mp4 (gif has no audio track)"),
      gifMaxWidth: z
        .number()
        .int()
        .positive()
        .max(GIF_MAX_WIDTH_OVERRIDE_CEILING_PX)
        .optional()
        .describe(
          "Overrides the default 960px GIF width ceiling for this export only (format: gif); ignored for mp4"
        ),
      crop: z
        .object({
          focusX: z.number().min(0).max(1).optional(),
          focusY: z.number().min(0).max(1).optional(),
          scale: z.number().min(1).max(3).optional(),
        })
        .optional()
        .describe("One-off reframe crop overrides for this export"),
      fps: z
        .number()
        .int()
        .min(1)
        .max(120)
        .optional()
        .describe("Output frame rate; default = source rate"),
      platform: z
        .enum(EXPORT_PLATFORM_IDS)
        .optional()
        .describe(
          "Destination preset (youtube, youtube-4k, x, linkedin, shorts); fills any of aspect/compression/fps/maxHeight/loudnessTargetLufs left unset above, explicit fields always win"
        ),
      loudnessTargetLufs: z
        .number()
        .min(-30)
        .max(-10)
        .optional()
        .describe(
          "Loudness normalization target (LUFS) for this export only; overrides project.audio.loudness without mutating the project"
        ),
    }),
    run: async ({
      slug: projectSlug,
      aspect,
      maxHeight,
      compression,
      crop,
      format,
      fps,
      gifMaxWidth,
      platform,
      loudnessTargetLufs,
    }) =>
      exportCut(projectSlug, {
        aspect,
        compression,
        crop,
        format,
        fps,
        gifMaxWidth,
        loudnessTargetLufs,
        maxHeight,
        platform,
      }),
  }),
  defineQueryTool({
    name: "verify",
    summary:
      "Re-transcribe the rendered cut and check it against the EDL (filler, leaked cuts, coverage).",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const report = await verifyCut(projectSlug);
      return { ...report, verdict: verifyVerdict(report) };
    },
  }),
  // ── FEATURE 3: multi-take assembly (takes/ + ffmpeg, like export/verify) ──
  defineQueryTool({
    name: "list_takes",
    summary:
      "List ingested takes for a project (id, label, duration, word count).",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const takes = await listTakes(projectSlug);
      return {
        takes: takes.map((t) => ({
          id: t.id,
          label: t.label,
          durationSec: samplesToSec(t.durationSamples),
          words: t.words.length,
        })),
      };
    },
  }),
  defineQueryTool({
    name: "take_transcript",
    summary:
      "Full transcript of one ingested take (word ids for an assemble selection).",
    schema: z.object({ slug, takeId: z.string().min(1) }),
    run: async ({ slug: projectSlug, takeId }) => {
      const take = await loadTake(projectSlug, takeId);
      return {
        takeId: take.id,
        label: take.label,
        words: take.words.map((w, index) => ({
          index,
          id: w.id,
          text: w.text,
          startSec: samplesToSec(w.startSample),
          endSec: samplesToSec(w.endSample),
        })),
        total: take.words.length,
      };
    },
  }),
  defineQueryTool({
    name: "assemble",
    summary:
      "Splice chosen runs from ingested takes into a single new source (originals untouched).",
    schema: z.object({
      slug,
      segments: z
        .array(
          z.object({
            takeId: z.string().min(1),
            startWordId: z.string().min(1),
            endWordId: z.string().min(1),
            note: z.string().optional(),
          })
        )
        .min(1),
      padMs: z.number().nonnegative().max(500).optional(),
      force: z.boolean().optional(),
    }),
    run: async ({ slug: projectSlug, segments, padMs, force }) =>
      assembleFromSelection(
        projectSlug,
        { segments, ...(padMs === undefined ? {} : { padMs }) },
        { force, actor: toolActor() }
      ),
  }),
];

// revert is a manual AgentToolDef (not built with defineQueryTool/mutationTool)
// for two reasons: it is NOT a registry action (registry actions are pure
// in-memory Project -> Project transforms; revert reads a snapshot file off
// disk before it can mutate anything, see src/revert.ts), and its "exactly
// one of to/task/last" constraint needs a zod .refine(), which would turn the
// schema into a ZodEffects that zodShapeFromSchema can't read fields off of.
// So the refined schema drives validation in run() while the plain base
// schema's shape (revertBaseShape) is what MCP's inputSchema actually sees.
const revertBaseShape = {
  slug,
  to: z.number().int().nonnegative().optional(),
  task: z.string().min(1).optional(),
  last: z.boolean().optional(),
  force: z.boolean().optional(),
};
const revertSchema = z
  .object(revertBaseShape)
  .refine(
    (v) =>
      [v.to !== undefined, v.task !== undefined, v.last === true].filter(
        Boolean
      ).length === 1,
    { message: 'revert requires exactly one of "to", "task", or "last"' }
  );

const revertTool: AgentToolDef = {
  name: "revert",
  summary:
    "Revert a project to an earlier logged revision: --to a revision, --task an agent task's changes, or --last the most recent edit.",
  surfaces: ["mcp", "cli"],
  schema: revertSchema,
  zodShape: revertBaseShape,
  run: (raw) => {
    const { slug: projectSlug, to, task, force } = revertSchema.parse(raw);
    const target: RevertTarget =
      to === undefined
        ? task === undefined
          ? { last: true }
          : { task, force }
        : { to };
    return revertProject(projectSlug, target, {
      actor: toolActor(),
      taskId: toolTaskId(),
    });
  },
};

const mutationTools = actions.map(mutationTool);

const allTools: AgentToolDef[] = [...queryTools, revertTool, ...mutationTools];

const byName = new Map(allTools.map((t) => [t.name, t]));

export function agentTools(surface?: Surface): AgentToolDef[] {
  if (!surface) {
    return allTools;
  }
  return allTools.filter((t) => t.surfaces.includes(surface));
}

export function agentToolNames(surface?: Surface): string[] {
  return agentTools(surface).map((t) => t.name);
}

export function getAgentTool(name: string): AgentToolDef | undefined {
  return byName.get(name);
}

export interface AgentToolManifestEntry {
  inputSchema: unknown;
  name: string;
  summary: string;
  surfaces: Surface[];
}

export function agentToolManifest(surface?: Surface): AgentToolManifestEntry[] {
  return agentTools(surface).map((t) => ({
    name: t.name,
    summary: t.summary,
    surfaces: t.surfaces,
    inputSchema: z.toJSONSchema(t.schema),
  }));
}

export async function callAgentTool(
  name: string,
  rawInput: unknown
): Promise<unknown> {
  const tool = getAgentTool(name);
  if (!tool) {
    const known = agentToolNames().join(", ");
    throw new Error(`unknown agent tool "${name}". Known tools: ${known}`);
  }
  assertScopedProjectInput({
    hasSlugInput: Object.hasOwn(tool.zodShape, "slug"),
    rawInput,
    toolName: name,
  });
  try {
    return await tool.run(rawInput);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const detail = err.issues
        .map((i) => {
          const path = i.path.join(".");
          return path ? `${path}: ${i.message}` : i.message;
        })
        .join("; ");
      throw new Error(`invalid input for "${name}": ${detail}`);
    }
    throw err;
  }
}

export function agentToolTable(surface?: Surface): string {
  const rows = agentTools(surface).map(
    (t) => `| \`${t.name}\` | ${t.summary} | ${t.surfaces.join(", ")} |`
  );
  return [
    "| Tool | What it does | Surfaces |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}
