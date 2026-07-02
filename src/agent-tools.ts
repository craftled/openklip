// Unified agent tool registry: query reads, registry mutations, and lifecycle
// commands in one manifest. CLI (`openklip tools`), MCP (stdio server), and docs
// all read from here so surfaces stay in sync with the GUI's project.json edits.
import { z } from "zod";
import { type Actor, actorFromEnv } from "./action-log.ts";
import { assembleFromSelection, listTakes, loadTake } from "./assembly.ts";
import { samplesToSec } from "./edl.ts";
import { EXPORT_COMPRESSIONS, exportCut } from "./exporter.ts";
import { listGraphics } from "./graphics.ts";
import { listLuts } from "./lut.ts";
import { listProjects, loadProject, mutateProject } from "./projectStore.ts";
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
import {
  applyProjectTemplate,
  listTemplates,
  loadTemplateSkill,
} from "./templates.ts";
import { verifyCut, verifyVerdict } from "./verify.ts";

const slug = z.string().min(1).describe("Project slug under projects/");

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

function scopedProjectSlug(): string | undefined {
  const scoped = process.env.OPENKLIP_SLUG?.trim();
  return scoped ? scoped : undefined;
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
        { action: action.name, actor: toolActor(), input: actionInput }
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
    name: "project_status",
    summary: "Agent-friendly edit summary (words, ranges, overlays, look).",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const project = await loadProject(projectSlug);
      return projectStatus(project);
    },
  }),
  defineQueryTool({
    name: "project_ranges",
    summary: "Kept source-time segments after cuts and pad.",
    schema: z.object({ slug }),
    run: async ({ slug: projectSlug }) => {
      const project = await loadProject(projectSlug);
      return { ranges: listRanges(project) };
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
    name: "title-add-phrase",
    summary: "Place a title at the first spoken phrase match (min 2s span).",
    schema: z.object({
      slug,
      spokenPhrase: z.string().min(1),
      text: z.string().min(1),
      position: z.enum(["lower", "center", "hero"]).default("lower"),
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
        }
      ),
  }),
  defineQueryTool({
    name: "export",
    summary: "Render the current cut to output/out.mp4.",
    schema: z.object({
      slug,
      maxHeight: z.number().int().positive().max(4320).optional(),
      compression: z
        .enum(EXPORT_COMPRESSIONS)
        .optional()
        .describe("Encoder preset; default social (today's settings)"),
      fps: z
        .number()
        .int()
        .min(1)
        .max(120)
        .optional()
        .describe("Output frame rate; default = source rate"),
    }),
    run: async ({ slug: projectSlug, maxHeight, compression, fps }) =>
      exportCut(projectSlug, { compression, fps, maxHeight }),
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
        { force }
      ),
  }),
];

const mutationTools = actions.map(mutationTool);

const allTools: AgentToolDef[] = [...queryTools, ...mutationTools];

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
