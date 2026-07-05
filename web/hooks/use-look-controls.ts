"use client";

import type { ColorAdjust, Filter } from "@engine/edl";
import { type Dispatch, type SetStateAction, useCallback } from "react";
import type { ProjectSaves } from "@/hooks/use-project-saves";
import type { EditorProject } from "@/lib/editor-types";
import { runGuiAction, saveLook, saveProjectEdits } from "../../app/actions.ts";

export interface UseLookControlsParams {
  enqueueSave: ProjectSaves["enqueueSave"];
  projectSlug: string;
  setCaptionsOn: Dispatch<SetStateAction<boolean>>;
  setColorState: Dispatch<SetStateAction<ColorAdjust | null>>;
  setFilterState: Dispatch<SetStateAction<Filter>>;
  setMotionSpeed: Dispatch<SetStateAction<number>>;
  setProject: Dispatch<SetStateAction<EditorProject>>;
  setVignetteOn: Dispatch<SetStateAction<boolean>>;
}

export function useLookControls({
  enqueueSave,
  projectSlug,
  setCaptionsOn,
  setColorState,
  setFilterState,
  setMotionSpeed,
  setProject,
  setVignetteOn,
}: UseLookControlsParams) {
  const toggleCaptions = useCallback(
    (next: boolean) => {
      setCaptionsOn(next);
      enqueueSave(() =>
        runGuiAction(projectSlug, "captions", { enabled: next })
      );
    },
    [enqueueSave, projectSlug, setCaptionsOn]
  );

  const toggleVignette = useCallback(
    (next: boolean) => {
      setVignetteOn(next);
      enqueueSave(() =>
        runGuiAction(projectSlug, "look-vignette", { vignette: next })
      );
    },
    [enqueueSave, projectSlug, setVignetteOn]
  );

  const changeFilter = useCallback(
    (next: Filter) => {
      setFilterState(next);
      enqueueSave(() => saveLook(projectSlug, { filter: next }));
    },
    [enqueueSave, projectSlug, setFilterState]
  );

  const changeColor = useCallback(
    (next: ColorAdjust) => {
      const neutral =
        next.temperature === 0 &&
        next.tint === 0 &&
        next.brightness === 0 &&
        next.contrast === 1 &&
        next.saturation === 1;
      setColorState(neutral ? null : next);
      enqueueSave(() => saveLook(projectSlug, { color: next }));
    },
    [enqueueSave, projectSlug, setColorState]
  );

  const changeMotionSpeed = useCallback(
    (next: number) => {
      setMotionSpeed(next);
      enqueueSave(() => runGuiAction(projectSlug, "motion", { speed: next }));
    },
    [enqueueSave, projectSlug, setMotionSpeed]
  );

  const setMaxWords = useCallback(
    (n: number) => {
      setProject((p) => ({
        ...p,
        captions: {
          enabled: p.captions?.enabled ?? true,
          ...p.captions,
          maxWords: n,
        },
      }));
      enqueueSave(() =>
        runGuiAction(projectSlug, "captions-max", { maxWords: n })
      );
    },
    [enqueueSave, projectSlug, setProject]
  );

  const setCaptionStyle = useCallback(
    (styleId: string) => {
      setProject((p) => ({
        ...p,
        captions: {
          enabled: p.captions?.enabled ?? true,
          ...p.captions,
          style: styleId,
        },
      }));
      enqueueSave(() =>
        runGuiAction(projectSlug, "captions-style", { style: styleId })
      );
    },
    [enqueueSave, projectSlug, setProject]
  );

  const setPad = useCallback(
    (n: number) => {
      setProject((p) => ({ ...p, padMs: n }));
      enqueueSave(() => saveProjectEdits(projectSlug, { padMs: n }));
    },
    [enqueueSave, projectSlug, setProject]
  );

  return {
    changeColor,
    changeFilter,
    changeMotionSpeed,
    setCaptionStyle,
    setMaxWords,
    setPad,
    toggleCaptions,
    toggleVignette,
  };
}
