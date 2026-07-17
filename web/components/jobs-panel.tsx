"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toastError, toastInfo, toastSuccess } from "@/lib/app-toast";
import { FolderOpen, RotateCcw, Trash2, X } from "@/lib/icon";
import {
  cancelIngestJob,
  cancelSilencesJob,
  deleteIngestJob,
  deleteSilencesJob,
  type JobView,
  listIngestJobs,
  listSilencesJobs,
  retryIngestJob,
  retrySilencesJob,
} from "@/lib/jobs-client";
import { relativeTimeAgo } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

const BADGE_BASE =
  "inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 font-medium text-xs uppercase tracking-wide";

// Distinct classes per status so a busy Job Center is scannable at a
// glance, mirroring history-panel.tsx's actorBadgeClass pattern.
const STATUS_BADGES: Record<JobView["status"], string> = {
  running: "bg-primary/10 text-primary",
  done: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  error: "bg-destructive/10 text-destructive",
  partial: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  interrupted: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  cancelled: "bg-muted text-muted-foreground",
};

function statusBadgeClass(status: JobView["status"]): string {
  return `${BADGE_BASE} ${STATUS_BADGES[status]}`;
}

/** A stable row key across both job kinds: ingest and silences ids are
 * generated independently (silences ids happen to embed a slug prefix,
 * ingest ids don't), so a bare id is not guaranteed unique across kinds. */
function rowKey(job: JobView): string {
  return `${job.kind}:${job.id}`;
}

const RETRYABLE: ReadonlySet<JobView["status"]> = new Set([
  "error",
  "interrupted",
  "cancelled",
  "partial",
]);

export interface JobsListActions {
  onCancel: (job: JobView) => void;
  onCleanupArm: (job: JobView) => void;
  onCleanupCancel: () => void;
  onCleanupConfirm: (job: JobView) => void;
  onOpen: (job: JobView) => void;
  onRetry: (job: JobView) => void;
}

// Pure presentational list: all fetch/timer/mutation logic lives in
// JobsPanel below, so this can be rendered with injected arrays in tests.
export function JobsList({
  busyRowKey,
  cleanupArmedId,
  jobs,
  onCancel,
  onCleanupArm,
  onCleanupCancel,
  onCleanupConfirm,
  onOpen,
  onRetry,
}: JobsListActions & {
  busyRowKey?: string | null;
  cleanupArmedId: string | null;
  jobs: JobView[];
}) {
  if (jobs.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No background jobs yet. Ingests and silence analyses appear here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5" data-jobs-list>
      {jobs.map((job) => {
        const key = rowKey(job);
        const busy = busyRowKey === key;
        const showCancel = job.status === "running";
        const showRetry = RETRYABLE.has(job.status);
        const showCleanup = job.status !== "running";
        const showOpen =
          job.kind === "ingest" &&
          (job.status === "done" || job.status === "partial");
        const message = job.error ?? job.warning;
        return (
          <li
            className="flex flex-col gap-1 rounded-md border border-border/60 px-2 py-1.5"
            data-job-row
            key={key}
          >
            <div className="flex items-center gap-2">
              <span
                className="min-w-0 flex-1 truncate text-xs"
                title={job.label}
              >
                {job.label}
              </span>
              <span
                className={statusBadgeClass(job.status)}
                data-job-status={job.status}
              >
                {job.status}
              </span>
            </div>
            {job.status === "running" && job.progress ? (
              <p
                className="text-[11px] text-muted-foreground"
                data-job-progress
              >
                {job.progress.message ?? "Working"}
                {job.progress.step != null && job.progress.total != null
                  ? ` · ${job.progress.step}/${job.progress.total}`
                  : ""}
              </p>
            ) : null}
            {message ? (
              <p
                className="truncate text-[11px] text-muted-foreground"
                data-job-error={job.error ? "" : undefined}
                data-job-warning={!job.error && job.warning ? "" : undefined}
                title={message}
              >
                {message}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                {relativeTimeAgo(job.updatedAt)}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {showCancel ? (
                  <Button
                    className="h-6 rounded-sm px-1.5 text-xs"
                    data-job-cancel
                    disabled={busy}
                    onClick={() => onCancel(job)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <X className="size-3" />
                    Cancel
                  </Button>
                ) : null}
                {showRetry ? (
                  <Button
                    className="h-6 rounded-sm px-1.5 text-xs"
                    data-job-retry
                    disabled={busy}
                    onClick={() => onRetry(job)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <RotateCcw className="size-3" />
                    Retry
                  </Button>
                ) : null}
                {showOpen ? (
                  <Button
                    className="h-6 rounded-sm px-1.5 text-xs"
                    data-job-open
                    onClick={() => onOpen(job)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <FolderOpen className="size-3" />
                    Open
                  </Button>
                ) : null}
                {showCleanup ? (
                  cleanupArmedId === key ? (
                    <span className="flex items-center gap-1 text-[11px]">
                      <span className="text-muted-foreground">Delete?</span>
                      <Button
                        className="h-6 rounded-sm px-1.5 text-destructive text-xs hover:bg-destructive/10"
                        data-job-cleanup-confirm
                        disabled={busy}
                        onClick={() => onCleanupConfirm(job)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Confirm
                      </Button>
                      <Button
                        className="h-6 rounded-sm px-1.5 text-muted-foreground text-xs"
                        data-job-cleanup-cancel-confirm
                        disabled={busy}
                        onClick={onCleanupCancel}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <Button
                      aria-label="Clean up job record"
                      className={cn(
                        "h-6 rounded-sm px-1.5 text-muted-foreground text-xs hover:bg-destructive/10 hover:text-destructive"
                      )}
                      data-job-cleanup
                      disabled={busy}
                      onClick={() => onCleanupArm(job)}
                      size="sm"
                      title="Clean up job record"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )
                ) : null}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function sortJobs(jobs: JobView[]): JobView[] {
  return [...jobs].sort((a, b) => b.updatedAt - a.updatedAt);
}

function anyRunning(jobs: JobView[]): boolean {
  return jobs.some((j) => j.status === "running");
}

const POLL_MS = 2000;

export function JobsPanel({ slug }: { slug: string | null }) {
  const router = useRouter();
  const [ingestJobs, setIngestJobs] = useState<JobView[]>([]);
  const [silencesJobs, setSilencesJobs] = useState<JobView[]>([]);
  const [loading, setLoading] = useState(false);
  const [cleanupArmedId, setCleanupArmedId] = useState<string | null>(null);
  const [busyRowKey, setBusyRowKey] = useState<string | null>(null);
  // Mirrors the merged running state without triggering a render, for the
  // poll effect's dependency (see task-progress-panel.tsx's runningRef for
  // the same reasoning: a fresh-array `jobs` dependency would tear the poll
  // effect down and rebuild it every tick).
  const runningRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ingestResult, silencesResult] = await Promise.all([
        listIngestJobs(),
        slug
          ? listSilencesJobs(slug)
          : Promise.resolve({ ok: true as const, jobs: [] }),
      ]);
      const nextIngest = ingestResult.ok ? ingestResult.jobs : [];
      const nextSilences = silencesResult.ok ? silencesResult.jobs : [];
      setIngestJobs(nextIngest);
      setSilencesJobs(nextSilences);
      runningRef.current = anyRunning([...nextIngest, ...nextSilences]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!runningRef.current) {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
    // Re-arm the interval whenever a refresh completes (loading flips),
    // so it stops the moment no job is running anymore.
  }, [refresh, loading]);

  const handleCancel = useCallback(
    async (job: JobView) => {
      const key = rowKey(job);
      setBusyRowKey(key);
      try {
        const result =
          job.kind === "ingest"
            ? await cancelIngestJob(job.id)
            : await cancelSilencesJob(job.slug, job.id);
        if (result.ok) {
          toastSuccess("Job cancelled");
        } else {
          toastInfo(result.error ?? "Could not cancel this job");
        }
        await refresh();
      } finally {
        setBusyRowKey(null);
      }
    },
    [refresh]
  );

  const handleRetry = useCallback(
    async (job: JobView) => {
      const key = rowKey(job);
      setBusyRowKey(key);
      try {
        const result =
          job.kind === "ingest"
            ? await retryIngestJob(job.id)
            : await retrySilencesJob(job.slug, job.id);
        if (result.ok) {
          toastSuccess("Job retried");
        } else {
          toastError(result.error ?? "Could not retry this job");
        }
        await refresh();
      } finally {
        setBusyRowKey(null);
      }
    },
    [refresh]
  );

  const handleCleanupConfirm = useCallback(
    async (job: JobView) => {
      const key = rowKey(job);
      setBusyRowKey(key);
      try {
        const result =
          job.kind === "ingest"
            ? await deleteIngestJob(job.id)
            : await deleteSilencesJob(job.slug, job.id);
        if (result.ok) {
          toastSuccess("Job record cleaned up");
        } else {
          toastError(result.error ?? "Could not clean up this job");
        }
        setCleanupArmedId(null);
        await refresh();
      } finally {
        setBusyRowKey(null);
      }
    },
    [refresh]
  );

  const handleOpen = useCallback(
    (job: JobView) => {
      router.push(`/?slug=${encodeURIComponent(job.slug)}`);
    },
    [router]
  );

  const jobs = sortJobs([...ingestJobs, ...silencesJobs]);

  return (
    <div className="flex flex-col gap-2 p-3" data-jobs-panel>
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Jobs
        </h3>
        <Button
          aria-label="Refresh jobs"
          className="text-muted-foreground"
          data-jobs-refresh
          disabled={loading}
          onClick={() => void refresh()}
          size="icon-sm"
          title="Refresh"
          type="button"
          variant="ghost"
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>
      <JobsList
        busyRowKey={busyRowKey}
        cleanupArmedId={cleanupArmedId}
        jobs={jobs}
        onCancel={handleCancel}
        onCleanupArm={(job) => setCleanupArmedId(rowKey(job))}
        onCleanupCancel={() => setCleanupArmedId(null)}
        onCleanupConfirm={handleCleanupConfirm}
        onOpen={handleOpen}
        onRetry={handleRetry}
      />
    </div>
  );
}
