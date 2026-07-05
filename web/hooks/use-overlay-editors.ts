"use client";

import type { Keyframe } from "@engine/keyframes";
import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";
import type {
  TimelineClipKind,
  TimelineTiming,
} from "@/components/edit-timeline";
import type {
  EditorBrollItem,
  EditorProject,
  EditorSelection,
  EditorStillItem,
  EditorTitleItem,
  EditorZoomItem,
} from "@/lib/editor-types";
import type { ActionResult } from "../../app/actions.ts";
import {
  runGuiAction,
  saveBroll,
  saveStills,
  saveTitles,
  saveZooms,
} from "../../app/actions.ts";

export interface UseOverlayEditorsParams {
  chosenAsset: string;
  chosenStillAsset: string;
  clearSelection: () => void;
  enqueueSave: (task: () => Promise<ActionResult>) => void;
  project: EditorProject;
  selected: EditorSelection;
  selRange: readonly [number, number] | null;
  setProject: Dispatch<SetStateAction<EditorProject>>;
  setSelected: Dispatch<SetStateAction<EditorSelection>>;
  setTitleText: Dispatch<SetStateAction<string>>;
  titlePos: "lower" | "center" | "hero";
  titleText: string;
}

export function useOverlayEditors({
  chosenAsset,
  chosenStillAsset,
  clearSelection,
  enqueueSave,
  project,
  selRange,
  selected,
  setProject,
  setSelected,
  setTitleText,
  titlePos,
  titleText,
}: UseOverlayEditorsParams) {
  const addZoom = useCallback(() => {
    if (!selRange) {
      return;
    }
    const [a, b] = selRange;
    const id = `z${Date.now()}`;
    const zooms = [
      ...(project.zooms ?? []),
      {
        id,
        startSample: project.words[a].startSample,
        endSample: project.words[b].endSample,
        scale: 1.15,
        rampSec: 0.6,
      },
    ];
    setProject({ ...project, zooms });
    enqueueSave(() => saveZooms(project.slug, zooms));
    clearSelection();
    setSelected({ kind: "zoom", id });
  }, [clearSelection, enqueueSave, project, selRange, setProject, setSelected]);

  const addBroll = useCallback(() => {
    if (!(selRange && chosenAsset)) {
      return;
    }
    const [a, b] = selRange;
    const id = `br${Date.now()}`;
    const broll = [
      ...(project.broll ?? []),
      {
        id,
        assetId: chosenAsset,
        startSample: project.words[a].startSample,
        endSample: project.words[b].endSample,
        srcInSample: 0,
        display: "cover" as const,
      },
    ];
    setProject({ ...project, broll });
    enqueueSave(() => saveBroll(project.slug, broll));
    clearSelection();
    setSelected({ kind: "broll", id });
  }, [
    chosenAsset,
    clearSelection,
    enqueueSave,
    project,
    selRange,
    setProject,
    setSelected,
  ]);

  const addTitle = useCallback(() => {
    if (!(selRange && titleText.trim())) {
      return;
    }
    const [a, b] = selRange;
    const id = `t${Date.now()}`;
    const titles = [
      ...(project.titles ?? []),
      {
        id,
        text: titleText.trim(),
        startSample: project.words[a].startSample,
        endSample: project.words[b].endSample,
        position: titlePos,
      },
    ];
    setProject({ ...project, titles });
    enqueueSave(() => saveTitles(project.slug, titles));
    setTitleText("");
    clearSelection();
    setSelected({ kind: "title", id });
  }, [
    clearSelection,
    enqueueSave,
    project,
    selRange,
    setProject,
    setSelected,
    setTitleText,
    titlePos,
    titleText,
  ]);

  const addStill = useCallback(() => {
    if (!(selRange && chosenStillAsset)) {
      return;
    }
    const [a, b] = selRange;
    const id = `s${Date.now()}`;
    const stills = [
      ...(project.stills ?? []),
      {
        id,
        assetId: chosenStillAsset,
        startSample: project.words[a].startSample,
        endSample: project.words[b].endSample,
        scale: 1.2,
        focusX: 0.5,
        focusY: 0.5,
      },
    ];
    setProject({ ...project, stills });
    enqueueSave(() => saveStills(project.slug, stills));
    clearSelection();
    setSelected({ kind: "still", id });
  }, [
    chosenStillAsset,
    clearSelection,
    enqueueSave,
    project,
    selRange,
    setProject,
    setSelected,
  ]);

  const updateZoom = useCallback(
    (id: string, patch: Partial<EditorZoomItem>) => {
      const zooms = (project.zooms ?? []).map((z) =>
        z.id === id ? { ...z, ...patch } : z
      );
      setProject({ ...project, zooms });
      enqueueSave(() => saveZooms(project.slug, zooms));
    },
    [enqueueSave, project, setProject]
  );

  const updateTitle = useCallback(
    (id: string, patch: Partial<EditorTitleItem>) => {
      const titles = (project.titles ?? []).map((t) =>
        t.id === id ? { ...t, ...patch } : t
      );
      setProject({ ...project, titles });
      enqueueSave(() => saveTitles(project.slug, titles));
    },
    [enqueueSave, project, setProject]
  );

  const updateBroll = useCallback(
    (id: string, patch: Partial<EditorBrollItem>) => {
      const broll = (project.broll ?? []).map((b) =>
        b.id === id ? { ...b, ...patch } : b
      );
      setProject({ ...project, broll });
      enqueueSave(() => saveBroll(project.slug, broll));
    },
    [enqueueSave, project, setProject]
  );

  const updateStill = useCallback(
    (id: string, patch: Partial<EditorStillItem>) => {
      const stills = (project.stills ?? []).map((s) =>
        s.id === id ? { ...s, ...patch } : s
      );
      setProject({ ...project, stills });
      enqueueSave(() => saveStills(project.slug, stills));
    },
    [enqueueSave, project, setProject]
  );

  const updateGraphic = useCallback(
    (id: string, patch: { keyframes: Keyframe[] }) => {
      setProject((prev) => {
        const graphics = (prev.graphics ?? []).map((g) =>
          g.id === id ? { ...g, keyframes: patch.keyframes } : g
        );
        const graphic = graphics.find((g) => g.id === id);
        const actionName =
          graphic?.type === "json-render" ? "json-graphic-set" : "graphic-set";
        enqueueSave(() =>
          runGuiAction(prev.slug, actionName, {
            id,
            keyframes: patch.keyframes,
          })
        );
        return { ...prev, graphics };
      });
    },
    [enqueueSave, setProject]
  );

  const onClipTiming = useCallback(
    (
      kind: TimelineClipKind,
      id: string,
      timing: TimelineTiming,
      commit: boolean
    ) => {
      const patch = {
        startSample: timing.startSample,
        endSample: timing.endSample,
      };
      setProject((prev) => {
        if (kind === "zoom") {
          const zooms = (prev.zooms ?? []).map((z) =>
            z.id === id ? { ...z, ...patch } : z
          );
          if (commit) {
            enqueueSave(() => saveZooms(prev.slug, zooms));
          }
          return { ...prev, zooms };
        }
        if (kind === "broll") {
          const broll = (prev.broll ?? []).map((b) =>
            b.id === id ? { ...b, ...patch } : b
          );
          if (commit) {
            enqueueSave(() => saveBroll(prev.slug, broll));
          }
          return { ...prev, broll };
        }
        if (kind === "title") {
          const titles = (prev.titles ?? []).map((t) =>
            t.id === id ? { ...t, ...patch } : t
          );
          if (commit) {
            enqueueSave(() => saveTitles(prev.slug, titles));
          }
          return { ...prev, titles };
        }
        if (kind === "graphic") {
          const graphics = (prev.graphics ?? []).map((g) =>
            g.id === id ? { ...g, ...patch } : g
          );
          if (commit) {
            const graphic = graphics.find((g) => g.id === id);
            const actionName =
              graphic?.type === "json-render"
                ? "json-graphic-set"
                : "graphic-set";
            enqueueSave(() =>
              runGuiAction(prev.slug, actionName, {
                id,
                fromSec: timing.startSample / prev.sampleRate,
                toSec: timing.endSample / prev.sampleRate,
              })
            );
          }
          return { ...prev, graphics };
        }
        if (kind === "music") {
          const music = (prev.music ?? []).map((m) =>
            m.id === id ? { ...m, ...patch } : m
          );
          if (commit) {
            enqueueSave(() =>
              runGuiAction(prev.slug, "music-set", {
                id,
                fromSec: timing.startSample / prev.sampleRate,
                toSec: timing.endSample / prev.sampleRate,
              })
            );
          }
          return { ...prev, music };
        }
        const stills = (prev.stills ?? []).map((s) =>
          s.id === id ? { ...s, ...patch } : s
        );
        if (commit) {
          enqueueSave(() => saveStills(prev.slug, stills));
        }
        return { ...prev, stills };
      });
    },
    [enqueueSave, setProject]
  );

  const reorderBrollOrder = useCallback(
    (orderedIds: string[]) => {
      const map = new Map((project.broll ?? []).map((b) => [b.id, b]));
      const broll = orderedIds
        .map((id) => map.get(id))
        .filter((b): b is EditorBrollItem => Boolean(b));
      setProject({ ...project, broll });
      enqueueSave(() => saveBroll(project.slug, broll));
    },
    [enqueueSave, project, setProject]
  );

  const removeSelected = useCallback(() => {
    if (!selected) {
      return;
    }
    if (selected.kind === "zoom") {
      const zooms = (project.zooms ?? []).filter((z) => z.id !== selected.id);
      setProject({ ...project, zooms });
      enqueueSave(() => saveZooms(project.slug, zooms));
    } else if (selected.kind === "broll") {
      const broll = (project.broll ?? []).filter((b) => b.id !== selected.id);
      setProject({ ...project, broll });
      enqueueSave(() => saveBroll(project.slug, broll));
    } else if (selected.kind === "title") {
      const titles = (project.titles ?? []).filter((t) => t.id !== selected.id);
      setProject({ ...project, titles });
      enqueueSave(() => saveTitles(project.slug, titles));
    } else if (selected.kind === "still") {
      const stills = (project.stills ?? []).filter((s) => s.id !== selected.id);
      setProject({ ...project, stills });
      enqueueSave(() => saveStills(project.slug, stills));
    } else if (selected.kind === "graphic") {
      const graphics = (project.graphics ?? []).filter(
        (g) => g.id !== selected.id
      );
      setProject({ ...project, graphics });
      enqueueSave(() =>
        runGuiAction(project.slug, "graphic-rm", { id: selected.id })
      );
    }
    setSelected(null);
  }, [enqueueSave, project, selected, setProject, setSelected]);

  return {
    addBroll,
    addStill,
    addTitle,
    addZoom,
    onClipTiming,
    removeSelected,
    reorderBrollOrder,
    updateBroll,
    updateGraphic,
    updateStill,
    updateTitle,
    updateZoom,
  };
}
