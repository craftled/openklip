"use client";

import { validateProductAnnouncementSpec } from "@engine/product-announcement";
import { useMemo } from "react";
import { ZOOM_PRESETS } from "@/components/config/config-section";
import type {
  EditorProject,
  EditorSelection,
  EditorZoomItem,
} from "@/lib/editor-types";
import { playheadOffsetInClip } from "@/lib/keyframe-ui";

export interface UseEditorSelectionParams {
  curSample: number;
  project: EditorProject;
  selected: EditorSelection;
}

export function useEditorSelection({
  curSample,
  project,
  selected,
}: UseEditorSelectionParams) {
  const selZoom =
    selected?.kind === "zoom"
      ? project.zooms.find((z) => z.id === selected.id)
      : undefined;
  const selTitle =
    selected?.kind === "title"
      ? project.titles.find((t) => t.id === selected.id)
      : undefined;
  const selBroll =
    selected?.kind === "broll"
      ? project.broll.find((b) => b.id === selected.id)
      : undefined;
  const selStill =
    selected?.kind === "still"
      ? project.stills?.find((s) => s.id === selected.id)
      : undefined;
  const selGraphic =
    selected?.kind === "graphic"
      ? project.graphics?.find((g) => g.id === selected.id)
      : undefined;

  const selectedJsonGraphicSpec =
    selGraphic?.type === "json-render" ? selGraphic.spec : undefined;

  const selGraphicValidation = useMemo(
    () =>
      selectedJsonGraphicSpec === undefined
        ? null
        : validateProductAnnouncementSpec(selectedJsonGraphicSpec),
    [selectedJsonGraphicSpec]
  );

  const selGraphicLabel =
    selGraphic?.type === "json-render" ? "Announcement graphic" : "Graphic";

  const selGraphicKeyframes = useMemo(() => {
    if (!selGraphic?.keyframes?.length) {
      return [];
    }
    return [...selGraphic.keyframes].sort(
      (a, b) => a.sampleOffset - b.sampleOffset
    );
  }, [selGraphic?.keyframes]);

  const graphicPlayheadOffset = selGraphic
    ? playheadOffsetInClip(
        curSample,
        selGraphic.startSample,
        selGraphic.endSample
      )
    : null;

  const hasOverlayInspector = Boolean(
    selected && (selZoom || selTitle || selBroll || selStill || selGraphic)
  );

  const presetOf = (z: EditorZoomItem) =>
    Object.entries(ZOOM_PRESETS).find(
      ([, v]) =>
        Math.abs(z.scale - v.scale) < 0.001 &&
        Math.abs(z.rampSec - v.rampSec) < 0.001
    )?.[0] ?? "";

  return {
    graphicPlayheadOffset,
    hasOverlayInspector,
    presetOf,
    selBroll,
    selGraphic,
    selGraphicKeyframes,
    selGraphicLabel,
    selGraphicValidation,
    selStill,
    selTitle,
    selZoom,
  };
}

export type UseEditorSelectionReturn = ReturnType<typeof useEditorSelection>;
