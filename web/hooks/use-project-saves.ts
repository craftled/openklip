"use client";

import type { MutableRefObject } from "react";
import { useCallback, useRef, useState } from "react";
import { toastSaveError } from "@/lib/app-toast";
import type { ActionResult } from "../../app/actions.ts";

export interface ProjectSaves {
  enqueueSave: (task: () => Promise<ActionResult>) => void;
  pendingSaves: number;
  saveChainRef: MutableRefObject<Promise<void>>;
  saveError: string | null;
  saveErrorRef: MutableRefObject<string | null>;
  setSaveError: (message: string | null) => void;
}

export function useProjectSaves(
  onSaveSuccess?: () => void | Promise<void>
): ProjectSaves {
  const [pendingSaves, setPendingSaves] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveErrorRef = useRef<string | null>(null);

  const enqueueSave = useCallback((task: () => Promise<ActionResult>) => {
    const run = saveChainRef.current
      .catch(() => {
        // Keep later saves moving after one failed request.
      })
      .then(async () => {
        setPendingSaves((n) => n + 1);
        setSaveError(null);
        saveErrorRef.current = null;
        try {
          const data = await task();
          if (!data.ok) {
            throw new Error(data.error ?? "save failed");
          }
          if (onSaveSuccess) {
            await onSaveSuccess();
          }
        } catch (e) {
          const message = (e as Error).message;
          saveErrorRef.current = message;
          setSaveError(message);
          toastSaveError(message);
          throw e;
        } finally {
          setPendingSaves((n) => Math.max(0, n - 1));
        }
      });
    saveChainRef.current = run.catch(() => {
      // The visible error state above is the user-facing failure path.
    });
  }, [onSaveSuccess]);

  return {
    enqueueSave,
    pendingSaves,
    saveChainRef,
    saveError,
    saveErrorRef,
    setSaveError,
  };
}
