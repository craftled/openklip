// Unified agent tool registry: query reads, registry mutations, and lifecycle
// commands in one manifest. CLI (`openklip tools`), MCP (stdio server), and docs
// all read from here so surfaces stay in sync with the GUI's project.json edits.
import { z } from "zod";
import {
  type Actor,
  actorFromEnv,
  readActionLog,
  summarizeForLog,
} from "./action-log.ts";
import {
  type AgentTaskOutcome,
  type AgentTaskStatus,
  appendAgentTaskToolCall,
  completeAgentTask,
  listAgentTasks,
  setAgentTaskStep,
} from "./agent-tasks.ts";
import {
  assembleFromSelection,
  ingestTake,
  listTakes,
  loadTake,
} from "./assembly.ts";
import { loadAudioAnalysis } from "./audio-analysis.ts";
import type { SilenceSpan } from "./audio-analysis-core.ts";
import { measureProjectAudio } from "./audio-measure.ts";
import { ingestBlank } from "./blank-ingest.ts";
import { measureMusicBpm } from "./bpm.ts";
import { loadBrief, saveBrief } from "./brief.ts";
import { logBriefSet } from "./brief-log.ts";
import { suggestBroll } from "./broll-suggest.ts";
import { planTimelineSummary } from "./cam-mix.ts";
import { camMixOrRemix, camRemix } from "./cam-remix.ts";
import { type CamRole, ingestCam, listCams, setCam } from "./cams.ts";
import { buildCleanupReport } from "./cleanup.ts";
import { executeMomentSearch } from "./cli-query.ts";
import { transitionExportPreview } from "./cut-transition-gate.ts";
import { runDoctor } from "./doctor.ts";
import { PhraseAnchorSchema, type Project, samplesToSec } from "./edl.ts";
import { EXPORT_PLATFORM_IDS } from "./export-platforms.ts";
import {
  EXPORT_COMPRESSIONS,
  EXPORT_FORMATS,
  exportCut,
  GIF_MAX_WIDTH_OVERRIDE_CEILING_PX,
} from "./exporter.ts";
import { FEATURE_GROUP_IDS, featureManifest } from "./features.ts";
import { resolveGraphicPhraseParams } from "./graphic-phrase.ts";
import { finalizeGraphicSpan } from "./graphic-placement.ts";
import {
  graphicCompositionPath,
  listGraphics,
  loadGraphicManifest,
} from "./graphics.ts";
import { exportAllHighlights, exportHighlight } from "./highlight-export.ts";
import { detectHighlights, highlightClipLines } from "./highlights.ts";
import { listLuts } from "./lut.ts";
import { MAX_SEARCH_LIMIT } from "./moment-search.ts";
import { projectPaths } from "./paths.ts";
import { auditProjectForShip } from "./project-brief-audit.ts";
import {
  listHistorySnapshotRevisions,
  listProjects,
  loadProject,
  mutateProject,
} from "./projectStore.ts";
import { matchesAuthorFilter } from "./provenance.ts";
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
import { resolveSourceMediaStatus } from "./source-media.ts";
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
    name: "blank_ingest",
    summary:
      "Create a graphics-first blank canvas project (no speech transcript).",
    schema: z.object({
      slug: z.string().min(1).optional(),
      durationSec: z.number().min(1).max(3600).optional(),
      aspect: z.enum(["16:9", "9:16", "1:1"]).optional(),
      fps: z.number().int().min(1).max(120).optional(),
      color: z.string().optional(),
      force: z.boolean().optional(),
    }),
    run: async (input) => ({
      slug: await ingestBlank({
        slug: input.slug,
        durationSec: input.durationSec,
        aspect: input.aspect,
        fps: input.fps,
        color: input.color,
        force: input.force,
      }),
    }),
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
    name: "broll_suggest",
    summary:
      "Rank b-roll assets for a spoken span or free-text query using existing asset cards (summary, tags, bestFor). Respects mustUse/avoid flags.",
    schema: z
      .object({
        slug,
        text: z
          .string()
          .min(1)
          .optional()
          .describe("Free-text query (spoken topic or keywords)."),
        phrase: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Transcript phrase; resolved to kept words before ranking."
          ),
        top: z
          .number()
          .int()
          .positive()
          .max(20)
          .default(5)
          .describe("Max suggestions to return."),
      })
      .superRefine((input, ctx) => {
        if (!(input.text || input.phrase) || (input.text && input.phrase)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Provide exactly one of text or phrase (same as CLI broll-suggest).",
          });
        }
      }),
    run: async ({ slug: projectSlug, text, phrase, top }) => {
      const project = await loadProject(projectSlug);
      return suggestBroll(project, { text, phrase, top });
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
      const ranges = listRanges(project, silences);
      const { dir } = projectPaths(projectSlug);
      return projectStatus(project, silences, {
        sourceMedia: resolveSourceMediaStatus({
          dir,
          source: project.source,
          proxy: project.proxy,
        }),
        transitionExport: transitionExportPreview(project, ranges),
      });
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
    summary:
      "All b-roll, titles, zooms, stills, music, and graphics with ids and spans.",
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
      "Filler-word and dead-air cleanup candidates grouped by category (hesitation, hedging, repeat, dead-air) with savings estimates, safe/review risk, and the effective project.cuts.cleanup config (minSec, keepPadSec, category toggles). Apply safe candidates with cleanup-apply mode safe, or enabled categories plus all dead-air at minSec with cleanup-apply mode enabled.",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const project = await loadProject(projectSlug);
      const briefText = await loadBrief(projectSlug).catch(() => undefined);
      try {
        const analysis = await loadAudioAnalysis(projectSlug);
        return buildCleanupReport({
          project,
          silences: analysis.silences,
          briefText,
        });
      } catch {
        // No audio analysis yet (project never re-ingested since
        // audio16k.f32 was introduced): degrade to filler-only.
        return buildCleanupReport({
          project,
          silences: null,
          briefText,
        });
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
    name: "features_list",
    summary:
      "List shipped product capabilities with surfaces and related tools/actions.",
    schema: z.object({
      group: z.enum(FEATURE_GROUP_IDS).optional(),
      surface: z.enum(["cli", "gui", "mcp"]).optional(),
    }),
    run: ({ group, surface }) => featureManifest({ group, surface }),
  }),
  defineQueryTool({
    name: "luts",
    summary: "List available .cube LUTs (luts/) for look-lut.",
    schema: z.object({}),
    run: () => ({ luts: listLuts() }),
  }),
  defineQueryTool({
    name: "graphic_list",
    summary:
      "List available graphic templates with param schemas (graphics/*/manifest.json).",
    schema: z.object({ slug: slug.optional() }),
    run: ({ slug }) => ({
      graphics: listGraphics(slug ? { slug } : undefined),
    }),
  }),
  defineQueryTool({
    name: "graphic_show",
    summary: "Full manifest for one graphic template.",
    schema: z.object({ id: z.string().min(1), slug: slug.optional() }),
    surfaces: ["cli", "mcp"],
    run: ({ id, slug: projectSlug }) => {
      const manifest = loadGraphicManifest(
        id,
        projectSlug ? { slug: projectSlug } : undefined
      );
      return {
        id: manifest.id,
        manifest,
        compositionPath: graphicCompositionPath(
          id,
          projectSlug ? { slug: projectSlug } : undefined
        ),
      };
    },
  }),
  defineQueryTool({
    name: "moment_search",
    summary:
      "Search transcript text and visual scenes in one call (CLIP frame embeddings blended with scene-log summaries). The first call may block while the visual index builds if it is missing or stale.",
    schema: z.object({
      slug,
      query: z.string().min(1),
      limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
    }),
    run: async ({ slug: projectSlug, query, limit }) => {
      const project = await loadProject(projectSlug);
      return executeMomentSearch(projectSlug, project, query, { limit });
    },
  }),
  defineQueryTool({
    name: "music_bpm",
    summary:
      "Detect tempo (BPM) of a registered music asset; caches in working/music-bpm.json.",
    schema: z.object({
      slug,
      assetId: z.string().min(1),
      force: z.boolean().optional(),
    }),
    run: async ({ slug: projectSlug, assetId, force }) =>
      measureMusicBpm(projectSlug, assetId, { force }),
  }),
  defineQueryTool({
    name: "audio_measure",
    summary:
      "Read integrated loudness (LUFS) from the latest export or ingest proxy without re-exporting.",
    schema: z.object({
      slug,
      source: z.enum(["export", "proxy"]).optional(),
      targetLufs: z.number().min(-30).max(-10).optional(),
    }),
    run: async ({ slug: projectSlug, source, targetLufs }) =>
      measureProjectAudio(projectSlug, { source, targetLufs }),
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
    name: "brief_audit",
    summary:
      "Check the current edit against brief.md targets (runtime, b-roll/still counts, music gain, protected phrases, overlay visibility in kept ranges).",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const brief = await loadBrief(projectSlug);
      if (!brief?.trim()) {
        throw new Error(`no brief.md for ${projectSlug}; cannot audit`);
      }
      const project = await loadProject(projectSlug);
      return auditProjectForShip({ briefText: brief, project });
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
    name: "graphic-add-phrase",
    summary:
      "Place a graphic template at the first spoken phrase match (min 2s span).",
    schema: z.object({
      slug,
      template: z.string().min(1),
      spokenPhrase: z.string().min(1),
      params: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional(),
      track: z.enum(["broll", "title", "zoom"]).optional(),
      note: z.string().optional(),
      beats: z.number().positive().optional(),
      bpm: z.number().positive().optional(),
      musicAssetId: z.string().min(1).optional(),
    }),
    run: async ({
      slug: projectSlug,
      template,
      spokenPhrase,
      params,
      track,
      note,
      beats,
      bpm,
      musicAssetId,
    }) =>
      mutateProject(
        projectSlug,
        async (project) => {
          const phraseSpan = placeFromPhrase(project, spokenPhrase);
          if (!phraseSpan.matched) {
            throw new Error(`no match for spoken phrase: "${spokenPhrase}"`);
          }
          const mergedParams = resolveGraphicPhraseParams(
            project,
            template,
            spokenPhrase,
            params,
            phraseSpan.ids
          );
          const span = await finalizeGraphicSpan({
            slug: projectSlug,
            project,
            template,
            fromSec: phraseSpan.fromSec,
            toSec: phraseSpan.toSec,
            params: mergedParams,
            beats,
            bpm,
            musicAssetId,
          });
          return runAction("graphic-add", project, {
            template,
            fromSec: span.fromSec,
            toSec: span.toSec,
            params:
              Object.keys(mergedParams).length > 0 ? mergedParams : undefined,
            track,
            note,
            anchor: {
              phrase: spokenPhrase,
              wordIds: phraseSpan.ids,
              stale: false,
            },
          });
        },
        {
          action: "graphic-add-phrase",
          actor: toolActor(),
          input: { template, spokenPhrase, params, track, note },
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
      loudnessNormalize: z
        .boolean()
        .optional()
        .describe(
          "When false, skip loudness normalization for this export even if a platform preset or project.audio.loudness would apply"
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
      loudnessNormalize,
    }) =>
      exportCut(projectSlug, {
        aspect,
        compression,
        crop,
        format,
        fps,
        gifMaxWidth,
        loudnessTargetLufs,
        loudnessNormalize,
        maxHeight,
        platform,
      }),
  }),
  defineQueryTool({
    name: "doctor",
    summary:
      "Health check: ffmpeg, Whisper script, and optional project media (source, proxy, assets).",
    schema: z.object({ slug: slug.optional() }),
    run: async ({ slug: projectSlug }) => runDoctor(projectSlug),
  }),
  defineQueryTool({
    name: "highlights_detect",
    summary:
      "Run an LLM over the timed transcript to detect short-form clip candidates and save them on project.json.",
    schema: z.object({
      slug,
      agent: z.string().min(1).default("claude-opus-4-8"),
      maxClips: z.number().int().positive().max(20).default(5),
      targetClipSec: z.number().positive().max(120).default(45),
    }),
    run: async ({ slug: projectSlug, agent, maxClips, targetClipSec }) => {
      const project = await loadProject(projectSlug);
      const highlights = await detectHighlights(project, {
        agent,
        maxClips,
        targetClipSec,
      });
      if (!highlights) {
        throw new Error("highlight detection failed (no valid clips returned)");
      }
      await mutateProject(
        projectSlug,
        (draft) => {
          draft.highlights = highlights;
        },
        {
          action: "highlights-detect",
          actor: toolActor(),
          input: { agent, maxClips, targetClipSec },
          taskId: toolTaskId(),
        }
      );
      return {
        highlights,
        summary: highlightClipLines(highlights),
      };
    },
  }),
  defineQueryTool({
    name: "export_highlight",
    summary:
      "Export one or all stored highlight clips to output/highlights/{id}.mp4 without mutating the edit.",
    schema: z.object({
      slug,
      clipId: z
        .string()
        .min(1)
        .describe('Highlight id (for example "h1") or "all"'),
      platform: z.enum(EXPORT_PLATFORM_IDS).optional(),
    }),
    run: ({ slug: projectSlug, clipId, platform }) => {
      const exportOpts = platform ? { platform } : {};
      if (clipId === "all") {
        return exportAllHighlights(projectSlug, exportOpts);
      }
      return exportHighlight(projectSlug, clipId, exportOpts);
    },
  }),
  defineQueryTool({
    name: "take_add",
    summary:
      "Ingest an alternate take from a local video file into takes/<id>/ (probe, proxy, Whisper).",
    schema: z.object({
      slug,
      videoPath: z
        .string()
        .min(1)
        .describe("Absolute or cwd-relative path to the take video on disk"),
      id: z.string().min(1).optional(),
      label: z.string().optional(),
    }),
    run: async ({ slug: projectSlug, videoPath, id, label }) => {
      const take = await ingestTake(projectSlug, videoPath, { id, label });
      return {
        id: take.id,
        label: take.label,
        durationSec: samplesToSec(take.durationSamples),
        words: take.words.length,
      };
    },
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
  // ── Contextual cam switch (cams/ + ffmpeg, like takes/assemble) ──
  defineQueryTool({
    name: "cam_add",
    summary: "Ingest a cam video into cams/<id>/ (probe, proxy, 16k PCM).",
    schema: z.object({
      slug,
      videoPath: z
        .string()
        .min(1)
        .describe("Absolute or cwd-relative path to the cam video on disk"),
      id: z.string().min(1).optional(),
      name: z.string().optional(),
      role: z.enum(["speaker", "wide"]).optional(),
      offsetMs: z.number().int().optional(),
      force: z.boolean().optional(),
    }),
    run: async ({
      slug: projectSlug,
      videoPath,
      id,
      name,
      role,
      offsetMs,
      force,
    }) => {
      const cam = await ingestCam(projectSlug, videoPath, {
        id,
        name,
        role: role as CamRole | undefined,
        offsetMs,
        force,
      });
      return {
        id: cam.id,
        name: cam.name,
        role: cam.role,
        offsetMs: cam.offsetMs,
        durationSec: samplesToSec(cam.durationSamples),
        width: cam.width,
        height: cam.height,
      };
    },
  }),
  defineQueryTool({
    name: "list_cams",
    summary:
      "List ingested cams for a project (id, name, role, offset, duration).",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const cams = await listCams(projectSlug);
      return {
        cams: cams.map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
          offsetMs: c.offsetMs,
          durationSec: samplesToSec(c.durationSamples),
          width: c.width,
          height: c.height,
        })),
      };
    },
  }),
  defineQueryTool({
    name: "cam_set",
    summary: "Patch cam metadata (name, role, offset).",
    schema: z.object({
      slug,
      camId: z.string().min(1),
      name: z.string().optional(),
      role: z.enum(["speaker", "wide"]).optional(),
      offsetMs: z.number().int().optional(),
    }),
    run: async ({ slug: projectSlug, camId, name, role, offsetMs }) => {
      const cam = await setCam(projectSlug, camId, {
        name,
        role: role as CamRole | undefined,
        offsetMs,
      });
      return {
        id: cam.id,
        name: cam.name,
        role: cam.role,
        offsetMs: cam.offsetMs,
      };
    },
  }),
  defineQueryTool({
    name: "cam_mix",
    summary:
      "Mix ingested speaker cams into a single source with follow-speaker or LLM auto scene switching.",
    schema: z.object({
      slug,
      mode: z.enum(["follow", "auto"]).optional(),
      agent: z.string().optional(),
      masterMix: z.string().optional(),
      minShotMs: z.number().positive().optional(),
      maxShotMs: z.number().positive().optional(),
      interjectionMs: z.number().positive().optional(),
      leadMs: z.number().nonnegative().optional(),
      wide: z.enum(["auto", "off"]).optional(),
    }),
    run: async ({
      slug: projectSlug,
      mode,
      agent,
      masterMix,
      minShotMs,
      maxShotMs,
      interjectionMs,
      leadMs,
      wide,
    }) => {
      const settings = {
        ...(minShotMs === undefined ? {} : { minShotMs }),
        ...(maxShotMs === undefined ? {} : { maxShotMs }),
        ...(interjectionMs === undefined ? {} : { interjectionMs }),
        ...(leadMs === undefined ? {} : { leadMs }),
        ...(wide === undefined ? {} : { wide }),
      };
      const result = await camMixOrRemix(projectSlug, {
        mode,
        agent,
        masterMix,
        settings: Object.keys(settings).length > 0 ? settings : undefined,
      });
      const cams = await listCams(projectSlug);
      return {
        ...result,
        timeline: planTimelineSummary(result.plan, cams),
      };
    },
  }),
  defineQueryTool({
    name: "cam_override",
    summary:
      "Lock a manual shot override for a source-time span and re-mix the project.",
    schema: z.object({
      slug,
      fromSec: z.number().nonnegative(),
      toSec: z.number().positive(),
      shot: z.string().min(1),
      mode: z.enum(["follow", "auto"]).optional(),
      agent: z.string().optional(),
      minShotMs: z.number().positive().optional(),
      maxShotMs: z.number().positive().optional(),
      interjectionMs: z.number().positive().optional(),
      leadMs: z.number().nonnegative().optional(),
      wide: z.enum(["auto", "off"]).optional(),
    }),
    run: async ({
      slug: projectSlug,
      fromSec,
      toSec,
      shot,
      mode,
      agent,
      minShotMs,
      maxShotMs,
      interjectionMs,
      leadMs,
      wide,
    }) => {
      const settings = {
        ...(minShotMs === undefined ? {} : { minShotMs }),
        ...(maxShotMs === undefined ? {} : { maxShotMs }),
        ...(interjectionMs === undefined ? {} : { interjectionMs }),
        ...(leadMs === undefined ? {} : { leadMs }),
        ...(wide === undefined ? {} : { wide }),
      };
      const result = await camRemix(projectSlug, {
        overrides: [{ fromSec, toSec, shot }],
        mode,
        agent,
        settings: Object.keys(settings).length > 0 ? settings : undefined,
      });
      const cams = await listCams(projectSlug);
      return {
        ...result,
        timeline: planTimelineSummary(result.plan, cams),
      };
    },
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

const graphicAddShape = {
  slug,
  template: z.string(),
  fromSec: z.number(),
  toSec: z.number(),
  params: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
  track: z.enum(["broll", "title", "zoom"]).optional(),
  note: z.string().optional(),
  anchor: PhraseAnchorSchema.optional(),
  beats: z.number().positive().optional(),
  bpm: z.number().positive().optional(),
  musicAssetId: z.string().min(1).optional(),
};
const graphicAddSchema = z.object(graphicAddShape);

const graphicAddTool: AgentToolDef = {
  name: "graphic-add",
  summary:
    "Overlay an HTML/CSS graphic template over a source-time span. Optional beats/bpm/musicAssetId snap span length to music tempo.",
  surfaces: ["cli", "gui", "mcp"],
  schema: graphicAddSchema,
  zodShape: graphicAddShape,
  run: async (raw) => {
    const input = graphicAddSchema.parse(raw);
    const {
      slug: projectSlug,
      template,
      params,
      track,
      note,
      anchor,
      beats,
      bpm,
      musicAssetId,
    } = input;
    let { fromSec, toSec } = input;
    const project = await loadProject(projectSlug);
    const span = await finalizeGraphicSpan({
      slug: projectSlug,
      project,
      template,
      fromSec,
      toSec,
      params: params ?? {},
      beats,
      bpm,
      musicAssetId,
    });
    fromSec = span.fromSec;
    toSec = span.toSec;
    return mutateProject(
      projectSlug,
      (p) =>
        runAction("graphic-add", p, {
          template,
          fromSec,
          toSec,
          params,
          track,
          note,
          anchor,
        }),
      {
        action: "graphic-add",
        actor: toolActor(),
        input: {
          template,
          fromSec,
          toSec,
          params,
          track,
          note,
          anchor,
          beats,
          bpm,
          musicAssetId,
        },
        taskId: toolTaskId(),
      }
    );
  },
};

const mutationTools = [
  ...actions.filter((a) => a.name !== "graphic-add").map(mutationTool),
  graphicAddTool,
];

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
  const taskId = toolTaskId();
  const projectSlug = rawInputSlug(rawInput) ?? scopedProjectSlug();
  try {
    const result = await tool.run(rawInput);
    if (taskId && projectSlug) {
      await appendAgentTaskToolCall(projectSlug, taskId, {
        toolName: name,
        ok: true,
        input: summarizeForLog(rawInput),
        output: summarizeForLog(result),
      }).catch(() => undefined);
    }
    return result;
  } catch (err) {
    if (taskId && projectSlug) {
      await appendAgentTaskToolCall(projectSlug, taskId, {
        toolName: name,
        ok: false,
        input: summarizeForLog(rawInput),
        output: summarizeForLog((err as Error).message),
      }).catch(() => undefined);
    }
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
