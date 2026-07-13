"use client";

import type { Project as EngineProject } from "@engine/edl";
import { type DragEvent, useCallback, useState } from "react";
import { toastMomentAlreadyInEdit, toastMomentKept } from "@/lib/app-toast";
import type { EditorProject } from "@/lib/editor-types";
import {
  decodeMomentDragPayload,
  deletedWordIdsInSpan,
  encodeMomentDragPayload,
  MOMENT_DRAG_MIME,
  type MomentSpanWord,
  momentDragTypesInclude,
} from "@/lib/moment-keep";
import { formatClock } from "@/lib/moment-search-display";
import { reanchoredWordUpdate } from "@/lib/reanchored-word-update";
import { cn } from "@/lib/utils";
import type { ActionResult } from "../../app/actions.ts";
import { runGuiAction } from "../../app/actions.ts";

export interface UseMomentKeepParams {
  enqueueSave: (task: () => Promise<ActionResult>) => void;
  onSeek: (sourceSec: number) => void;
  setProject: React.Dispatch<React.SetStateAction<EditorProject>>;
  slug: string;
  words: readonly MomentSpanWord[];
}

export function useMomentKeep({
  enqueueSave,
  onSeek,
  setProject,
  slug,
  words,
}: UseMomentKeepParams) {
  const keepMoment = useCallback(
    (fromSec: number, toSec: number) => {
      const deletedIds = deletedWordIdsInSpan(words, fromSec, toSec);
      if (deletedIds.length === 0) {
        onSeek(fromSec);
        toastMomentAlreadyInEdit();
        return;
      }
      setProject(
        (prev) =>
          reanchoredWordUpdate(
            prev as unknown as EngineProject,
            new Set(deletedIds),
            false
          ) as unknown as EditorProject
      );
      enqueueSave(() =>
        runGuiAction(slug, "cut", {
          ids: deletedIds,
          deleted: false,
        })
      );
      onSeek(fromSec);
      toastMomentKept(fromSec, toSec, deletedIds.length, formatClock);
    },
    [enqueueSave, onSeek, setProject, slug, words]
  );

  return { keepMoment };
}

const noopKeepMoment = () => undefined;

export function useMomentDropZone(
  keepMoment: (fromSec: number, toSec: number) => void = noopKeepMoment
) {
  const [dragging, setDragging] = useState(false);

  const onDragEnter = useCallback((event: DragEvent) => {
    if (!momentDragTypesInclude(event.dataTransfer.types)) {
      return;
    }
    event.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((event: DragEvent) => {
    if (!momentDragTypesInclude(event.dataTransfer.types)) {
      return;
    }
    event.preventDefault();
    if (event.currentTarget === event.target) {
      setDragging(false);
    }
  }, []);

  const onDragOver = useCallback((event: DragEvent) => {
    if (!momentDragTypesInclude(event.dataTransfer.types)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      if (!momentDragTypesInclude(event.dataTransfer.types)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
      const raw = event.dataTransfer.getData(MOMENT_DRAG_MIME);
      const payload = decodeMomentDragPayload(raw);
      if (!payload) {
        return;
      }
      keepMoment(payload.fromSec, payload.toSec);
    },
    [keepMoment]
  );

  const dropClassName = cn(
    dragging && "rounded-lg bg-primary/5 ring-1 ring-primary/35"
  );

  return {
    dropClassName,
    dragging,
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDrop,
  };
}

export function onMomentCardDragStart(
  event: DragEvent,
  span: { fromSec: number; toSec: number }
): void {
  event.stopPropagation();
  event.dataTransfer.setData(MOMENT_DRAG_MIME, encodeMomentDragPayload(span));
  event.dataTransfer.effectAllowed = "copy";
}
