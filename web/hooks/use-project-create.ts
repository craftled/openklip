"use client";

import { useCallback, useState } from "react";
import type { ProjectCreatePhase } from "@/components/project-create-overlay";
import {
  toastDismiss,
  toastLoading,
  toastProjectCreateFailed,
} from "@/lib/app-toast";
import type { IngestProgressView } from "@/lib/project-create";
import { projectIngestLoadingMessage } from "@/lib/toast-notifications";
import { SUCCESS_CHECK_HOLD_MS } from "../../src/successCheck.ts";

export function useProjectCreate({
  onCreateProject,
  onProjectCreated,
}: {
  onCreateProject: (
    file: File,
    onProgress: (p: IngestProgressView) => void
  ) => Promise<string>;
  onProjectCreated: (slug: string) => void;
}) {
  const [createPhase, setCreatePhase] = useState<ProjectCreatePhase | null>(
    null
  );
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [progress, setProgress] = useState<IngestProgressView | null>(null);
  const creating = createPhase !== null;

  const ingestVideo = useCallback(
    async (file: File) => {
      setCreatePhase("creating");
      setCreatedSlug(null);
      setProgress(null);
      const loadingId = toastLoading(projectIngestLoadingMessage());
      try {
        const slug = await onCreateProject(file, setProgress);
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
    },
    [onCreateProject, onProjectCreated]
  );

  return { createPhase, createdSlug, creating, ingestVideo, progress };
}
