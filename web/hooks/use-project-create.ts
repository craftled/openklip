"use client";

import { useCallback, useState } from "react";
import type { ProjectCreatePhase } from "@/components/project-create-overlay";
import {
  toastDismiss,
  toastLoading,
  toastProjectCreateFailed,
} from "@/lib/app-toast";
import { projectIngestLoadingMessage } from "@/lib/toast-notifications";
import { SUCCESS_CHECK_HOLD_MS } from "../../src/successCheck.ts";

export function useProjectCreate({
  onCreateProject,
  onProjectCreated,
}: {
  onCreateProject: (file: File) => Promise<string>;
  onProjectCreated: (slug: string) => void;
}) {
  const [createPhase, setCreatePhase] = useState<ProjectCreatePhase | null>(
    null
  );
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const creating = createPhase !== null;

  const ingestVideo = useCallback(
    async (file: File) => {
      setCreatePhase("creating");
      setCreatedSlug(null);
      const loadingId = toastLoading(projectIngestLoadingMessage());
      try {
        const slug = await onCreateProject(file);
        toastDismiss(loadingId);
        setCreatedSlug(slug);
        setCreatePhase("success");
        await new Promise((resolve) =>
          window.setTimeout(resolve, SUCCESS_CHECK_HOLD_MS)
        );
        onProjectCreated(slug);
      } catch (e) {
        toastDismiss(loadingId);
        toastProjectCreateFailed((e as Error).message);
      } finally {
        setCreatePhase(null);
        setCreatedSlug(null);
      }
    },
    [onCreateProject, onProjectCreated]
  );

  return { createPhase, createdSlug, creating, ingestVideo };
}
