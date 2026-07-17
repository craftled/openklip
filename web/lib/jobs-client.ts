// Typed client for the Job Center panel: normalizes both job kinds (ingest
// is workspace-wide, silences is per-project; see src/ingest-jobs.ts and
// src/silences-jobs.ts's module docs for why they're stored differently)
// into one JobView shape the UI renders without caring which kind a row is.
//
// Every function here parses its response defensively (mirrors
// history-panel.tsx's parseHistoryEntries) and never throws: a malformed or
// failed response becomes { ok: false, error }, so the panel can always show
// an honest toast instead of an unhandled rejection.

export type JobViewKind = "ingest" | "silences";

// Union of both engines' status types (src/ingest-jobs.ts's IngestJobStatus
// is the superset: silences jobs never reach "partial").
export type JobViewStatus =
  | "running"
  | "done"
  | "error"
  | "partial"
  | "interrupted"
  | "cancelled";

export interface JobViewProgress {
  message?: string;
  step?: number;
  total?: number;
}

export interface JobView {
  createdAt: number;
  error?: string;
  id: string;
  kind: JobViewKind;
  label: string;
  progress?: JobViewProgress;
  slug: string;
  status: JobViewStatus;
  updatedAt: number;
  warning?: string;
}

export type JobsListResult =
  | { error: string; ok: false }
  | { jobs: JobView[]; ok: true };

export interface JobActionResult {
  error?: string;
  ok: boolean;
}

const STATUSES: ReadonlySet<string> = new Set([
  "running",
  "done",
  "error",
  "partial",
  "interrupted",
  "cancelled",
]);

function isJobViewStatus(value: unknown): value is JobViewStatus {
  return typeof value === "string" && STATUSES.has(value);
}

function parseProgress(value: unknown): JobViewProgress | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  const row = value as Record<string, unknown>;
  const progress: JobViewProgress = {};
  if (typeof row.message === "string") {
    progress.message = row.message;
  }
  if (typeof row.step === "number") {
    progress.step = row.step;
  }
  if (typeof row.total === "number") {
    progress.total = row.total;
  }
  return progress;
}

function ingestLabel(filename: unknown, slug: string): string {
  return typeof filename === "string" && filename
    ? `${filename} → ${slug}`
    : slug;
}

/** Keep only well-formed ingest job rows from an untrusted API payload. */
function parseIngestJobs(value: unknown): JobView[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: JobView[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const row = raw as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.slug !== "string" ||
      typeof row.createdAt !== "number" ||
      typeof row.updatedAt !== "number" ||
      !isJobViewStatus(row.status)
    ) {
      continue;
    }
    const job: JobView = {
      id: row.id,
      slug: row.slug,
      kind: "ingest",
      label: ingestLabel(row.filename, row.slug),
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    const progress = parseProgress(row.progress);
    if (progress) {
      job.progress = progress;
    }
    if (typeof row.error === "string") {
      job.error = row.error;
    }
    if (typeof row.warning === "string") {
      job.warning = row.warning;
    }
    out.push(job);
  }
  return out;
}

/** Keep only well-formed silences job rows from an untrusted API payload. */
function parseSilencesJobs(value: unknown): JobView[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: JobView[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const row = raw as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.slug !== "string" ||
      typeof row.createdAt !== "number" ||
      typeof row.updatedAt !== "number" ||
      !isJobViewStatus(row.status)
    ) {
      continue;
    }
    const job: JobView = {
      id: row.id,
      slug: row.slug,
      kind: "silences",
      label: `Silence analysis: ${row.slug}`,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    const progress = parseProgress(row.progress);
    if (progress) {
      job.progress = progress;
    }
    if (typeof row.error === "string") {
      job.error = row.error;
    }
    out.push(job);
  }
  return out;
}

async function getJobs(
  url: string,
  parse: (value: unknown) => JobView[]
): Promise<JobsListResult> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = (await res.json().catch(() => undefined)) as
        | { error?: string }
        | undefined;
      return {
        ok: false,
        error: body?.error ?? `request failed (${res.status})`,
      };
    }
    const data = (await res.json()) as { jobs?: unknown };
    return { ok: true, jobs: parse(data.jobs) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function postAction(url: string): Promise<JobActionResult> {
  try {
    const res = await fetch(url, { method: "POST" });
    const body = (await res.json().catch(() => undefined)) as
      | { error?: string; ok?: boolean }
      | undefined;
    if (!res.ok) {
      return {
        ok: false,
        error: body?.error ?? `request failed (${res.status})`,
      };
    }
    if (typeof body?.ok === "boolean") {
      return body.ok ? { ok: true } : { ok: false, error: body.error };
    }
    // Retry-style routes (200 { job }) have no `ok` field: reaching here at
    // all with a 200 status means the action succeeded.
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function deleteAction(url: string): Promise<JobActionResult> {
  try {
    const res = await fetch(url, { method: "DELETE" });
    const body = (await res.json().catch(() => undefined)) as
      | { error?: string; ok?: boolean }
      | undefined;
    if (!res.ok) {
      return {
        ok: false,
        error: body?.error ?? `request failed (${res.status})`,
      };
    }
    return { ok: body?.ok !== false };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function listIngestJobs(): Promise<JobsListResult> {
  return getJobs("/api/projects/jobs", parseIngestJobs);
}

export function listSilencesJobs(slug: string): Promise<JobsListResult> {
  return getJobs(
    `/api/projects/${encodeURIComponent(slug)}/silences/jobs`,
    parseSilencesJobs
  );
}

export function cancelIngestJob(id: string): Promise<JobActionResult> {
  return postAction(`/api/projects/ingest/${encodeURIComponent(id)}/cancel`);
}

export function retryIngestJob(id: string): Promise<JobActionResult> {
  return postAction(`/api/projects/ingest/${encodeURIComponent(id)}/retry`);
}

export function deleteIngestJob(id: string): Promise<JobActionResult> {
  return deleteAction(`/api/projects/ingest/${encodeURIComponent(id)}`);
}

export function cancelSilencesJob(
  slug: string,
  id: string
): Promise<JobActionResult> {
  return postAction(
    `/api/projects/${encodeURIComponent(slug)}/silences/${encodeURIComponent(id)}/cancel`
  );
}

export function retrySilencesJob(
  slug: string,
  id: string
): Promise<JobActionResult> {
  return postAction(
    `/api/projects/${encodeURIComponent(slug)}/silences/${encodeURIComponent(id)}/retry`
  );
}

export function deleteSilencesJob(
  slug: string,
  id: string
): Promise<JobActionResult> {
  return deleteAction(
    `/api/projects/${encodeURIComponent(slug)}/silences/${encodeURIComponent(id)}`
  );
}
