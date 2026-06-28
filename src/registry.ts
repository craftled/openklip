// The unified action registry: one named, schema-validated definition per
// project.json mutation. This is the single source of truth the CLI, the GUI
// server actions, and a future MCP/HTTP surface all route through : the same
// shape agent-native's defineAction gives (one action → UI + agent + HTTP +
// MCP). The pure mutation logic still lives in actions.ts; this layer adds the
// name, the input contract (Zod, which doubles as the agent's JSON-Schema tool
// definition), and the surface metadata, so parity is structural rather than a
// promise kept by hand across three dispatch sites.
import { z } from "zod";
import {
  addBroll,
  addStill,
  addTitle,
  addZoom,
  cutAllByText,
  cutByText,
  cutWords,
  removeBroll,
  removeStill,
  removeTitle,
  removeZoom,
  reorderBroll,
  reorderTitle,
  reorderZoom,
  restoreAll,
  setCaptionMaxWords,
  setCaptions,
  setLook,
  setMotion,
  setPadMs,
  updateBroll,
  updateStill,
  updateTitle,
  updateZoom,
} from "./actions.ts";
import { GradeSchema, type Project } from "./edl.ts";

// Where an action is exposed. The CLI dispatch, the editor's server actions, and
// the agent-facing manifest each filter the registry by surface.
export type Surface = "cli" | "gui" | "mcp";

export interface ActionDef {
  name: string;
  // Input is already validated against `schema` by the time `run` is called.
  run: (project: Project, input: unknown) => unknown;
  schema: z.ZodType;
  summary: string;
  surfaces: Surface[];
}

// Define an action with input types inferred from its Zod schema. The wrapper
// keeps `run` honest (it receives the parsed type) while the stored ActionDef
// erases the generic so the registry is a homogeneous list.
function defineAction<S extends z.ZodType>(def: {
  name: string;
  summary: string;
  surfaces: Surface[];
  schema: S;
  run: (project: Project, input: z.infer<S>) => unknown;
}): ActionDef {
  return def as ActionDef;
}

// Schemas describe input *shape* only : field names, types, enums, and which
// fields are required. All value bounds (non-negative seconds, scale 1–3, focus
// 0–1, maxWords 1–12, pad 0–500, …) and project-relative invariants (span vs.
// duration, asset existence/kind) are owned by the primitives in actions.ts,
// which throw or clamp. Keeping bounds in one place : the primitive : is what
// makes this registry DRY rather than a second copy of the rules to drift.
const sec = z.number();
const position = z.enum(["lower", "center", "hero"]);
const track = z.enum(["broll", "title", "zoom"]);

export const actions: ActionDef[] = [
  defineAction({
    name: "cut",
    summary: "Mark words deleted (or restored) by id.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      ids: z.array(z.string()).min(1),
      deleted: z.boolean().default(true),
    }),
    run: (p, i) => {
      cutWords(p, i.ids, i.deleted);
      return { cut: i.deleted, ids: i.ids };
    },
  }),
  defineAction({
    name: "cut-text",
    summary: "Cut the first (or every, with all) run matching a phrase.",
    surfaces: ["cli", "mcp"],
    schema: z.object({
      phrase: z.string().min(1),
      all: z.boolean().default(false),
    }),
    run: (p, i) => (i.all ? cutAllByText(p, i.phrase) : cutByText(p, i.phrase)),
  }),
  defineAction({
    name: "restore-all",
    summary: "Restore every word (clear all cuts).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({}),
    run: (p) => {
      restoreAll(p);
      return { ok: true };
    },
  }),
  defineAction({
    name: "broll-add",
    summary: "Cover a source-time span with a registered b-roll asset.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      assetId: z.string(),
      fromSec: sec,
      toSec: sec,
      srcInSec: sec.optional(),
    }),
    run: (p, i) => addBroll(p, i),
  }),
  defineAction({
    name: "broll-set",
    summary: "Patch a b-roll clip (asset, span, source in-point).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      id: z.string(),
      assetId: z.string().optional(),
      fromSec: sec.optional(),
      toSec: sec.optional(),
      srcInSec: sec.optional(),
    }),
    run: (p, i) => updateBroll(p, i.id, i),
  }),
  defineAction({
    name: "broll-rm",
    summary: "Remove a b-roll clip by id.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ id: z.string() }),
    run: (p, i) => ({ removed: removeBroll(p, i.id) }),
  }),
  defineAction({
    name: "still-add",
    summary: "Overlay a registered still image with a Ken Burns push-in.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      assetId: z.string(),
      fromSec: sec,
      toSec: sec,
      scale: z.number().optional(),
      focusX: z.number().optional(),
      focusY: z.number().optional(),
    }),
    run: (p, i) => addStill(p, i),
  }),
  defineAction({
    name: "still-rm",
    summary: "Remove a still overlay by id.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ id: z.string() }),
    run: (p, i) => ({ removed: removeStill(p, i.id) }),
  }),
  defineAction({
    name: "still-set",
    summary: "Patch a still overlay (asset, span, Ken Burns look).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      id: z.string(),
      assetId: z.string().optional(),
      fromSec: sec.optional(),
      toSec: sec.optional(),
      scale: z.number().optional(),
      focusX: z.number().optional(),
      focusY: z.number().optional(),
    }),
    run: (p, i) => updateStill(p, i.id, i),
  }),
  defineAction({
    name: "title-add",
    summary: "Burn a title card over a source-time span.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      fromSec: sec,
      toSec: sec,
      text: z.string(),
      position: position.optional(),
    }),
    run: (p, i) => addTitle(p, i),
  }),
  defineAction({
    name: "title-set",
    summary: "Patch a title card (text, position, span).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      id: z.string(),
      text: z.string().optional(),
      position: position.optional(),
      fromSec: sec.optional(),
      toSec: sec.optional(),
    }),
    run: (p, i) => updateTitle(p, i.id, i),
  }),
  defineAction({
    name: "title-rm",
    summary: "Remove a title card by id.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ id: z.string() }),
    run: (p, i) => ({ removed: removeTitle(p, i.id) }),
  }),
  defineAction({
    name: "zoom-add",
    summary: "Add a push-in zoom over a source-time span.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      fromSec: sec,
      toSec: sec,
      scale: z.number().optional(),
      rampSec: z.number().optional(),
    }),
    run: (p, i) => addZoom(p, i),
  }),
  defineAction({
    name: "zoom-set",
    summary: "Patch a push-in zoom (scale, ramp, span).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      id: z.string(),
      scale: z.number().optional(),
      rampSec: z.number().optional(),
      fromSec: sec.optional(),
      toSec: sec.optional(),
    }),
    run: (p, i) => updateZoom(p, i.id, i),
  }),
  defineAction({
    name: "zoom-rm",
    summary: "Remove a push-in zoom by id.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ id: z.string() }),
    run: (p, i) => ({ removed: removeZoom(p, i.id) }),
  }),
  defineAction({
    name: "captions",
    summary: "Toggle burned captions for export.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ enabled: z.boolean() }),
    run: (p, i) => {
      setCaptions(p, i.enabled);
      return { enabled: i.enabled };
    },
  }),
  defineAction({
    name: "captions-max",
    summary: "Set words per caption line (1–12).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ maxWords: z.number() }),
    run: (p, i) => {
      setCaptionMaxWords(p, i.maxWords);
      return { maxWords: p.captions.maxWords };
    },
  }),
  defineAction({
    name: "pad",
    summary: "Set symmetric padding around kept ranges (0–500 ms).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ padMs: z.number() }),
    run: (p, i) => {
      setPadMs(p, i.padMs);
      return { padMs: p.padMs };
    },
  }),
  defineAction({
    name: "look-vignette",
    summary: "Toggle the vignette look flag.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ vignette: z.boolean() }),
    run: (p, i) => {
      setLook(p, { vignette: i.vignette });
      return { vignette: i.vignette };
    },
  }),
  defineAction({
    name: "look-grade",
    summary: "Set the color grade applied to the whole picture at export.",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ grade: GradeSchema }),
    run: (p, i) => {
      setLook(p, { grade: i.grade });
      return { grade: p.look.grade };
    },
  }),
  defineAction({
    name: "look-lut",
    summary: "Set or clear a named .cube LUT (empty string clears).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({ lut: z.string() }),
    run: (p, i) => {
      setLook(p, { lut: i.lut });
      return { lut: p.look.lut ?? null };
    },
  }),
  defineAction({
    name: "motion",
    summary: "Set the global animation feel (speed, fade, slide).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      speed: z.number().min(0.25).max(4).optional(),
      fadeMs: z.number().min(0).max(2000).optional(),
      heroFadeMs: z.number().min(0).max(2000).optional(),
      slideFrac: z.number().min(0).max(0.3).optional(),
    }),
    run: (p, i) => {
      setMotion(p, i);
      return { motion: p.motion };
    },
  }),
  defineAction({
    name: "reorder",
    summary: "Restack an overlay within its track (paint order).",
    surfaces: ["cli", "gui", "mcp"],
    schema: z.object({
      track,
      id: z.string(),
      toIndex: z.number(),
    }),
    run: (p, i) => {
      const list =
        i.track === "broll"
          ? reorderBroll(p, i.id, i.toIndex)
          : i.track === "title"
            ? reorderTitle(p, i.id, i.toIndex)
            : reorderZoom(p, i.id, i.toIndex);
      return { track: i.track, order: list.map((x) => x.id) };
    },
  }),
];

const byName = new Map(actions.map((a) => [a.name, a]));

export function getAction(name: string): ActionDef | undefined {
  return byName.get(name);
}

// Validate `rawInput` against the action's schema, then run the mutation against
// `project`. Throws on unknown name or invalid input : the one dispatch path
// every surface shares.
export function runAction(
  name: string,
  project: Project,
  rawInput: unknown
): unknown {
  const action = getAction(name);
  if (!action) {
    const known = actions.map((a) => a.name).join(", ");
    throw new Error(`unknown action "${name}". Known actions: ${known}`);
  }
  let input: unknown;
  try {
    input = action.schema.parse(rawInput);
  } catch (err) {
    if (err instanceof z.ZodError) {
      // Flatten the issue list into one readable line instead of letting the
      // raw ZodError JSON reach the CLI/agent. e.g. `track: Invalid option …`.
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
  return action.run(project, input);
}

export interface ActionManifestEntry {
  // Zod rendered to JSON Schema : this is exactly the MCP tool inputSchema.
  // biome-ignore lint/suspicious/noExplicitAny: JSON Schema is an open shape.
  inputSchema: any;
  name: string;
  summary: string;
  surfaces: Surface[];
}

// A machine-readable capability manifest an external agent can read whole : the
// "agents read the action list from one place" idea, no per-tool wiring. Filter
// by surface to get, e.g., just the MCP-exposed actions.
export function actionManifest(surface?: Surface): ActionManifestEntry[] {
  return actions
    .filter((a) => !surface || a.surfaces.includes(surface))
    .map((a) => ({
      name: a.name,
      summary: a.summary,
      surfaces: a.surfaces,
      inputSchema: z.toJSONSchema(a.schema),
    }));
}

// Render the registry as a Markdown table : the generatable replacement for the
// hand-maintained capability map in AGENTS.md.
export function actionTable(surface?: Surface): string {
  const rows = actions
    .filter((a) => !surface || a.surfaces.includes(surface))
    .map((a) => `| \`${a.name}\` | ${a.summary} | ${a.surfaces.join(", ")} |`);
  return [
    "| Action | What it does | Surfaces |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}
