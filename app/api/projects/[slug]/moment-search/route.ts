import { existsSync } from "node:fs";
import { embedText } from "@engine/embed-service";
import {
  buildMomentIndex,
  DEFAULT_SEARCH_LIMIT,
  isMomentIndexCurrent,
  searchScenes,
} from "@engine/moment-search";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { loadProject } from "@engine/projectStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// In-memory, per-process build tracker (this server owns the single
// projects root, same assumption src/ingest-jobs.ts makes). "building"
// while a buildMomentIndex() run is in flight; "error" for exactly one GET
// after a run fails, then cleared so the client's Retry button starts
// clean. No entry at all means "never attempted, or last attempt
// succeeded" - GET tells those apart via isMomentIndexCurrent.
type BuildStatus = "building" | "error";
const buildStatus = new Map<string, BuildStatus>();

function startBuildIfNeeded(slug: string): void {
  if (buildStatus.get(slug) === "building") {
    return;
  }
  buildStatus.set(slug, "building");
  void buildMomentIndex(slug, { force: false })
    .then(() => {
      buildStatus.delete(slug);
    })
    .catch(() => {
      buildStatus.set(slug, "error");
    });
}

function parseLimit(raw: string | null): { error?: string; limit?: number } {
  if (raw === null) {
    return {};
  }
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit <= 0) {
    return { error: "limit must be a positive integer when provided" };
  }
  return { limit };
}

function slugOrError(slug: string): Response | null {
  try {
    assertValidSlug(slug);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  if (!existsSync(projectPaths(slug).project)) {
    return Response.json(
      { error: `project not found: ${slug}` },
      { status: 404 }
    );
  }
  return null;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { slug } = await params;
  const invalid = slugOrError(slug);
  if (invalid) {
    return invalid;
  }

  const status = buildStatus.get(slug);
  if (status === "error") {
    // One-shot: the next poll after this reverts to the plain "not indexed,
    // not building" shape, ready for another auto-retry or an explicit
    // Retry click to start a fresh build.
    buildStatus.delete(slug);
    return Response.json({
      indexed: false,
      building: false,
      error: true,
      results: [],
    });
  }
  const building = status === "building";

  const url = new URL(req.url);
  const { error: limitError, limit } = parseLimit(
    url.searchParams.get("limit")
  );
  if (limitError) {
    return Response.json({ error: limitError }, { status: 400 });
  }

  // Cheap fs-only freshness check before ever touching the warm embed
  // worker: a missing/stale sidecar means there is nothing to search yet,
  // so there is no reason to spawn/embed on every poll while building.
  if (!isMomentIndexCurrent(slug)) {
    return Response.json({ indexed: false, building, results: [] });
  }

  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) {
    return Response.json({ indexed: true, building: false, results: [] });
  }

  try {
    const project = await loadProject(slug);
    const { vector } = await embedText(q);
    const { results } = searchScenes(slug, project, vector, q, {
      limit: limit ?? DEFAULT_SEARCH_LIMIT,
    });
    return Response.json({ indexed: true, building: false, results });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Starts (or confirms) an index build in the background and returns
// immediately; the caller polls GET for progress. force:false so a
// still-current index is a fast no-op rather than a full re-embed.
export async function POST(_req: Request, { params }: RouteParams) {
  const { slug } = await params;
  const invalid = slugOrError(slug);
  if (invalid) {
    return invalid;
  }
  startBuildIfNeeded(slug);
  return Response.json({ building: true });
}
