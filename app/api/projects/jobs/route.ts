import { listIngestJobs } from "@engine/ingest-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Workspace-wide ingest job list (read-only, no trustGuard needed): lets the
// Job Center UI show every ingest job across all projects in one place,
// mirroring what the folder-watch route already returns as a side effect.
// There is no per-project-agnostic "list all silences jobs" helper yet
// (silences jobs are stored per-project, see src/silences-jobs.ts's module
// doc) — out of scope for this task; a caller that needs silences jobs for
// a specific project uses the existing per-project silences endpoints.
export function GET(): Response {
  return Response.json({ jobs: listIngestJobs() });
}
