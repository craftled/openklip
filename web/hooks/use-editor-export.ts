"use client";

import { type RefObject, useCallback, useState } from "react";
import type { ExportDialogOptions } from "@/components/export-dialog";
import {
  toastError,
  toastInfo,
  toastPromise,
  toastProxyExportWarning,
  toastSuccess,
  toastTransitionFallback,
} from "@/lib/app-toast";
import { resolveExportMaxHeight } from "@/lib/export-max-height";
import { exportPromiseMessages } from "@/lib/toast-notifications";
import { exportProject } from "../../app/actions.ts";

export interface UseEditorExportParams {
  projectSlug: string;
  saveChainRef: RefObject<Promise<void>>;
  saveErrorRef: RefObject<string | null>;
}

export function useEditorExport({
  projectSlug,
  saveChainRef,
  saveErrorRef,
}: UseEditorExportParams) {
  const [export1080, setExport1080] = useState(true);
  const [exporting, setExporting] = useState(false);

  const onExport = useCallback(
    async (options?: ExportDialogOptions) => {
      const maxHeight = resolveExportMaxHeight(
        options?.maxHeight,
        options !== undefined,
        export1080
      );
      if (options?.resolution) {
        setExport1080(
          options.resolution === "1080" || options.resolution === "720"
        );
      }
      setExporting(true);
      try {
        const exportRun = (async () => {
          await saveChainRef.current;
          if (saveErrorRef.current) {
            throw new Error(saveErrorRef.current);
          }
          const r = await exportProject(projectSlug, {
            compression: options?.compression,
            format: options?.format,
            fps:
              options?.frameRate === "source" ? undefined : options?.frameRate,
            gifMaxWidth: options?.gifMaxWidth,
            maxHeight,
            platform: options?.platform,
          });
          if (!r.ok) {
            throw new Error(r.error);
          }
          return r.data;
        })();

        void toastPromise(exportRun, exportPromiseMessages());
        const result = await exportRun;
        toastTransitionFallback(result.transition);
        toastProxyExportWarning(result.sourceMediaWarn);
        if (options?.destination === "clipboard") {
          toastInfo("Export path ready", result.out, {
            duration: 15_000,
            action: {
              label: "Copy path",
              onClick: () => {
                const clipboard = navigator.clipboard;
                if (!clipboard) {
                  toastError(
                    "Clipboard unavailable",
                    "Copy the path from the export toast."
                  );
                  return;
                }
                void clipboard
                  .writeText(result.out)
                  .then(() => toastSuccess("Path copied", result.out))
                  .catch((error) =>
                    toastError(
                      "Could not copy path",
                      error instanceof Error ? error.message : String(error)
                    )
                  );
              },
            },
          });
        }
      } catch {
        // toastPromise owns the export failure toast.
      } finally {
        setExporting(false);
      }
    },
    [export1080, projectSlug, saveChainRef, saveErrorRef]
  );

  return {
    export1080,
    exporting,
    onExport,
    setExport1080,
  };
}
