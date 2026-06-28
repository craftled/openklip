"use client";

import { useEffect, useState } from "react";

export interface InboxJob {
  filename: string;
  id: string;
  progress?: { message: string; step: number; total: number };
  slug: string;
  status: "running" | "done" | "error";
}

const POLL_MS = 5000;

// Folder-watch: poll the scan-inbox endpoint, which detects loose videos in the
// projects root and starts ingest jobs for them. Returns the jobs still running
// so the caller can show "ingesting…", and calls onIngested(slug) once each job
// finishes (e.g. to refresh the project list).
export function useInboxWatch(onIngested: (slug: string) => void): InboxJob[] {
  const [running, setRunning] = useState<InboxJob[]>([]);

  useEffect(() => {
    let alive = true;
    const done = new Set<string>();

    const tick = async () => {
      try {
        const res = await fetch("/api/projects/scan-inbox", { method: "POST" });
        if (!(alive && res.ok)) {
          return;
        }
        const data = (await res.json()) as { jobs: InboxJob[] };
        if (!alive) {
          return;
        }
        setRunning(data.jobs.filter((j) => j.status === "running"));
        for (const job of data.jobs) {
          if (job.status === "done" && !done.has(job.id)) {
            done.add(job.id);
            onIngested(job.slug);
          }
        }
      } catch {
        // best-effort: a failed tick just retries next interval
      }
    };

    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [onIngested]);

  return running;
}
