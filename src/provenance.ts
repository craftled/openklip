// Author identity for action history and word-level provenance. Proof-inspired
// authorId format without external deps. See AGENTS.md for env vars.

import { actorFromEnv } from "./action-log.ts";
import type { Actor } from "./action-log-entry.ts";
import type { Word } from "./edl.ts";

/** Meta passed to mutateProject (subset for provenance helpers). */
export interface ProvenanceMutateMeta {
  action: string;
  actor?: Actor;
  agentSurface?: string;
  authorId?: string;
  input?: unknown;
  model?: string;
  taskId?: string;
}

export interface ProvenanceFields {
  agentSurface?: string;
  authorId?: string;
  model?: string;
}

export type ResolveProvenanceInput = Pick<
  ProvenanceMutateMeta,
  "actor" | "authorId" | "agentSurface" | "model"
>;

export type ResolvedProvenance = ProvenanceFields & {
  authorId: string;
};

function agentSurfaceFromEnv(): string | undefined {
  const raw = process.env.OPENKLIP_AGENT_SURFACE?.trim();
  return raw || undefined;
}

function modelFromEnv(): string | undefined {
  const raw = process.env.OPENKLIP_AGENT_MODEL?.trim();
  return raw || undefined;
}

function authorIdFromEnv(): string | undefined {
  const raw = process.env.OPENKLIP_AUTHOR_ID?.trim();
  return raw || undefined;
}

function deriveAuthorId(
  actor: Actor,
  model?: string,
  surface?: string
): string {
  if (actor === "human") {
    if (surface === "gui") {
      return "human:local";
    }
    return "human:cli";
  }
  if (actor === "cli") {
    return "cli:openklip";
  }
  if (actor === "mcp") {
    return "mcp:openklip";
  }
  if (actor === "system") {
    return "system:openklip";
  }
  // agent
  if (model) {
    if (model.startsWith("claude-")) {
      return `ai:claude:${model}`;
    }
    if (model.startsWith("gpt-")) {
      return `ai:codex:${model}`;
    }
    if (model === "composer-2-5") {
      return "ai:cursor:composer-2-5";
    }
    if (model.startsWith("grok-")) {
      return `ai:grok:${model}`;
    }
    return `ai:agent:${model}`;
  }
  if (surface === "cursor") {
    return "ai:cursor";
  }
  if (surface === "codex") {
    return "ai:codex";
  }
  if (surface === "claude-code") {
    return "ai:claude";
  }
  return "ai:agent";
}

/** Resolve provenance for a logged mutation from meta + environment. */
export function resolveProvenance(
  meta?: ResolveProvenanceInput
): ResolvedProvenance {
  const actor = meta?.actor ?? actorFromEnv() ?? "human";
  const explicitAuthor = meta?.authorId ?? authorIdFromEnv();
  const model = meta?.model ?? modelFromEnv();
  const agentSurface = meta?.agentSurface ?? agentSurfaceFromEnv();

  const authorId = explicitAuthor ?? deriveAuthorId(actor, model, agentSurface);

  return {
    authorId,
    ...(agentSurface ? { agentSurface } : {}),
    ...(model ? { model } : {}),
  };
}

/** Provenance fields for explicit GUI human edits. */
export const GUI_HUMAN_PROVENANCE: ResolvedProvenance = {
  authorId: "human:local",
  agentSurface: "gui",
};

/** Stamp word-level provenance after a logged transcript mutation. */
export function stampProvenanceFromMutation(
  project: { words: Word[] } & OverlayProvenanceProject,
  meta: { action: string; input?: unknown; taskId?: string },
  result: unknown,
  provenance: ResolvedProvenance,
  revisionAfter: number
): void {
  const wordIds = wordIdsFromMutation(meta.action, meta.input, result, project);
  if (wordIds.length > 0) {
    stampWordProvenance(
      project.words,
      wordIds,
      provenance,
      revisionAfter,
      meta.taskId
    );
  }
  stampOverlayProvenanceFromMutation(
    project,
    meta.action,
    meta.input,
    result,
    provenance,
    revisionAfter,
    meta.taskId
  );
}

interface OverlayWithAuth {
  authoredAt?: number;
  authoredBy?: string;
  authoredRevision?: number;
  authoredTaskId?: string;
  id: string;
}

interface OverlayProvenanceProject {
  broll?: OverlayWithAuth[];
  graphics?: OverlayWithAuth[];
  music?: OverlayWithAuth[];
  stills?: OverlayWithAuth[];
  titles?: OverlayWithAuth[];
  zooms?: OverlayWithAuth[];
}

const OVERLAY_MUTATION_RE =
  /^(?:broll|title|zoom|still|music|graphic|json-graphic)-(?:add|set)$/;

function overlayIdFromMutation(
  action: string,
  input: unknown,
  result: unknown
): string | undefined {
  const r = result as { id?: string } | undefined;
  if (r?.id) {
    return r.id;
  }
  if (action.endsWith("-set")) {
    const i = input as { id?: string } | undefined;
    return i?.id;
  }
  return;
}

function findOverlay(
  project: OverlayProvenanceProject,
  id: string
): OverlayWithAuth | undefined {
  for (const arr of [
    project.broll,
    project.titles,
    project.zooms,
    project.stills,
    project.music,
    project.graphics,
  ]) {
    const found = arr?.find((item) => item.id === id);
    if (found) {
      return found;
    }
  }
  return;
}

/** Stamp overlay-level provenance after add/set mutations. */
export function stampOverlayProvenanceFromMutation(
  project: OverlayProvenanceProject,
  action: string,
  input: unknown,
  result: unknown,
  provenance: ResolvedProvenance,
  revisionAfter: number,
  taskId?: string
): void {
  if (!OVERLAY_MUTATION_RE.test(action)) {
    return;
  }
  const overlayId = overlayIdFromMutation(action, input, result);
  if (!overlayId) {
    return;
  }
  const overlay = findOverlay(project, overlayId);
  if (!overlay) {
    return;
  }
  overlay.authoredBy = provenance.authorId;
  overlay.authoredAt = Date.now();
  overlay.authoredRevision = revisionAfter;
  if (taskId) {
    overlay.authoredTaskId = taskId;
  } else {
    overlay.authoredTaskId = undefined;
  }
}

function wordIdsFromMutation(
  action: string,
  input: unknown,
  result: unknown,
  project: { words: Word[] }
): string[] {
  if (action === "restore-all") {
    return project.words.map((w) => w.id);
  }
  if (action === "word-text") {
    const r = result as { id?: string } | undefined;
    if (r?.id) {
      return [r.id];
    }
    const i = input as { id?: string } | undefined;
    return i?.id ? [i.id] : [];
  }
  if (action === "cut") {
    const r = result as { ids?: string[] } | undefined;
    if (r?.ids?.length) {
      return r.ids;
    }
    const i = input as { ids?: string[] } | undefined;
    return i?.ids ?? [];
  }
  if (action === "cut-text" || action === "filler-cuts") {
    const r = result as { ids?: string[] } | Array<{ id: string }> | undefined;
    if (Array.isArray(r)) {
      return r.map((w) => w.id);
    }
    return r?.ids ?? [];
  }
  if (action === "edit-words") {
    const i = input as { words?: Array<{ id: string }> } | undefined;
    return i?.words?.map((w) => w.id) ?? [];
  }
  return [];
}

/** Provenance fields for GUI server-action mutations. */
export function guiMutateMeta(
  action: string,
  input?: unknown,
  extra?: Partial<ProvenanceMutateMeta>
): ProvenanceMutateMeta {
  return {
    action,
    actor: "human",
    authorId: GUI_HUMAN_PROVENANCE.authorId,
    agentSurface: GUI_HUMAN_PROVENANCE.agentSurface,
    input,
    ...extra,
  };
}

/** Provenance for an agent-driven GUI mutation (filler cuts, etc.). */
export function agentGuiMutateMeta(
  action: string,
  model: string,
  input?: unknown,
  extra?: Partial<ProvenanceMutateMeta>
): ProvenanceMutateMeta {
  const provenance = resolveProvenance({
    action,
    actor: "agent",
    model,
    agentSurface: "gui",
    input,
  });
  return {
    action,
    actor: "agent",
    authorId: provenance.authorId,
    agentSurface: provenance.agentSurface ?? "gui",
    model,
    input,
    ...extra,
  };
}

/** Stamp provenance onto specific words. */
export function stampWordProvenance(
  words: Word[],
  wordIds: Iterable<string>,
  provenance: ResolvedProvenance,
  revisionAfter: number,
  taskId?: string
): void {
  const idSet = new Set(wordIds);
  const at = Date.now();
  for (const word of words) {
    if (!idSet.has(word.id)) {
      continue;
    }
    word.authoredBy = provenance.authorId;
    word.authoredAt = at;
    word.authoredRevision = revisionAfter;
    if (taskId) {
      word.authoredTaskId = taskId;
    } else {
      word.authoredTaskId = undefined;
    }
  }
}

/** Match history entries by authorId substring or exact model slug. */
export function matchesAuthorFilter(
  entry: ProvenanceFields,
  filter: string
): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const author = entry.authorId?.toLowerCase() ?? "";
  const model = entry.model?.toLowerCase() ?? "";
  return author.includes(needle) || model.includes(needle);
}
