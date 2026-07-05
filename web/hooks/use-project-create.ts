"use client";

import { useCallback, useState } from "react";
import type { ProjectCreatePhase } from "@/components/project-create-overlay";
import {
  toastDismiss,
  toastLoading,
  toastProjectCreateFailed,
} from "@/lib/app-toast";
import {
  createBlankProject,
  type IngestProgressView,
  type ProjectCreateOptions,
  ProjectExistsError,
} from "@/lib/project-create";
import { projectIngestLoadingMessage } from "@/lib/toast-notifications";
import { SUCCESS_CHECK_HOLD_MS } from "../../src/successCheck.ts";

export interface PendingOverwrite {
  file: File;
  /** Server copy explaining the conflict (names the existing slug). */
  message: string;
}

// A 409 on a non-forced create is actionable: surface an explicit replace
// confirmation instead of a dead-end error toast. Never auto-retry with force
// (re-ingest wipes the existing project dir), so a 409 on a forced create and
// every other error fail outright.
export function overwriteDecision(
  error: unknown,
  force: boolean
): "offer-overwrite" | "fail" {
  return !force && error instanceof ProjectExistsError
    ? "offer-overwrite"
    : "fail";
}

export function useProjectCreate({
  onCreateProject,
  onProjectCreated,
}: {
  onCreateProject: (
    file: File,
    onProgress: (p: IngestProgressView) => void,
    options?: ProjectCreateOptions
  ) => Promise<string>;
  onProjectCreated: (slug: string) => void;
}) {
  const [createPhase, setCreatePhase] = useState<ProjectCreatePhase | null>(
    null
  );
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [progress, setProgress] = useState<IngestProgressView | null>(null);
  const [pendingOverwrite, setPendingOverwrite] =
    useState<PendingOverwrite | null>(null);
  const creating = createPhase !== null;

  const runCreate = useCallback(
    async (file: File, force: boolean) => {
      setCreatePhase("creating");
      setCreatedSlug(null);
      setProgress(null);
      const loadingId = toastLoading(projectIngestLoadingMessage());
      try {
        const slug = await onCreateProject(file, setProgress, { force });
        toastDismiss(loadingId);
        setCreatedSlug(slug);
        setCreatePhase("success");
        await new Promise((resolve) => {
          window.setTimeout(resolve, SUCCESS_CHECK_HOLD_MS);
        });
        onProjectCreated(slug);
      } catch (e) {
        toastDismiss(loadingId);
        if (overwriteDecision(e, force) === "offer-overwrite") {
          setPendingOverwrite({ file, message: (e as Error).message });
        } else {
          toastProjectCreateFailed((e as Error).message);
        }
      } finally {
        setCreatePhase(null);
        setCreatedSlug(null);
        setProgress(null);
      }
    },
    [onCreateProject, onProjectCreated]
  );

  const ingestVideo = useCallback(
    (file: File) => runCreate(file, false),
    [runCreate]
  );

  const createBlank = useCallback(async () => {
    setCreatePhase("creating");
    setCreatedSlug(null);
    setProgress(null);
    const loadingId = toastLoading("Creating blank canvas…");
    try {
      const slug = await createBlankProject();
      toastDismiss(loadingId);
      setCreatedSlug(slug);
      setCreatePhase("success");
      await new Promise((resolve) => {
        window.setTimeout(resolve, SUCCESS_CHECK_HOLD_MS);
      });
      onProjectCreated(slug);
    } catch (e) {
      toastDismiss(loadingId);
      toastProjectCreateFailed((e as Error).message);
    } finally {
      setCreatePhase(null);
      setCreatedSlug(null);
      setProgress(null);
    }
  }, [onProjectCreated]);

  const confirmOverwrite = useCallback(() => {
    if (!pendingOverwrite) {
      return;
    }
    const { file } = pendingOverwrite;
    setPendingOverwrite(null);
    void runCreate(file, true);
  }, [pendingOverwrite, runCreate]);

  const cancelOverwrite = useCallback(() => {
    setPendingOverwrite(null);
  }, []);

  return {
    cancelOverwrite,
    confirmOverwrite,
    createBlank,
    createPhase,
    createdSlug,
    creating,
    ingestVideo,
    pendingOverwrite,
    progress,
  };
}
