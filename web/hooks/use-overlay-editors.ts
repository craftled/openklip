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
import { runGuiAction, saveBroll } from "../../app/actions.ts";

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

// Replace the array entry whose id === matchId with `item` (used to swap an
// optimistic client-side item for the server's authoritative one once an
// id-scoped add/set action round-trips - see CRAFT-6177).
function reconcileById<T extends { id: string }>(
  list: T[] | undefined,
  matchId: string,
  item: T
): T[] {
  return (list ?? []).map((x) => (x.id === matchId ? item : x));
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
    const tempId = `z${Date.now()}`;
    const fromSec = project.words[a].startSample / project.sampleRate;
    const toSec = project.words[b].endSample / project.sampleRate;
    const optimistic: EditorZoomItem = {
      id: tempId,
      startSample: project.words[a].startSample,
      endSample: project.words[b].endSample,
      scale: 1.15,
      rampSec: 0.6,
    };
    setProject((prev) => ({
      ...prev,
      zooms: [...(prev.zooms ?? []), optimistic],
    }));
    // ID-scoped: this only ever creates one new zoom, so it can never drop a
    // zoom added by the CLI/MCP after this browser's project snapshot.
    enqueueSave(async () => {
      const res = await runGuiAction(project.slug, "zoom-add", {
        fromSec,
        toSec,
      });
      if (res.ok) {
        const item = res.data.result as EditorZoomItem;
        setProject((prev) => ({
          ...prev,
          zooms: reconcileById(prev.zooms, tempId, item),
        }));
        setSelected((prev) =>
          prev?.kind === "zoom" && prev.id === tempId
            ? { kind: "zoom", id: item.id }
            : prev
        );
      }
      return res;
    });
    clearSelection();
    setSelected({ kind: "zoom", id: tempId });
  }, [clearSelection, enqueueSave, project, selRange, setProject, setSelected]);

  const addBroll = useCallback(() => {
    if (!(selRange && chosenAsset)) {
      return;
    }
    const [a, b] = selRange;
    const tempId = `br${Date.now()}`;
    const fromSec = project.words[a].startSample / project.sampleRate;
    const toSec = project.words[b].endSample / project.sampleRate;
    const optimistic: EditorBrollItem = {
      id: tempId,
      assetId: chosenAsset,
      startSample: project.words[a].startSample,
      endSample: project.words[b].endSample,
      srcInSample: 0,
      display: "cover",
    };
    setProject((prev) => ({
      ...prev,
      broll: [...(prev.broll ?? []), optimistic],
    }));
    enqueueSave(async () => {
      const res = await runGuiAction(project.slug, "broll-add", {
        assetId: chosenAsset,
        fromSec,
        toSec,
      });
      if (res.ok) {
        const item = res.data.result as EditorBrollItem;
        setProject((prev) => ({
          ...prev,
          broll: reconcileById(prev.broll, tempId, item),
        }));
        setSelected((prev) =>
          prev?.kind === "broll" && prev.id === tempId
            ? { kind: "broll", id: item.id }
            : prev
        );
      }
      return res;
    });
    clearSelection();
    setSelected({ kind: "broll", id: tempId });
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
    const tempId = `t${Date.now()}`;
    const text = titleText.trim();
    const fromSec = project.words[a].startSample / project.sampleRate;
    const toSec = project.words[b].endSample / project.sampleRate;
    const optimistic: EditorTitleItem = {
      id: tempId,
      text,
      startSample: project.words[a].startSample,
      endSample: project.words[b].endSample,
      position: titlePos,
    };
    setProject((prev) => ({
      ...prev,
      titles: [...(prev.titles ?? []), optimistic],
    }));
    enqueueSave(async () => {
      const res = await runGuiAction(project.slug, "title-add", {
        fromSec,
        toSec,
        text,
        position: titlePos,
      });
      if (res.ok) {
        const item = res.data.result as EditorTitleItem;
        setProject((prev) => ({
          ...prev,
          titles: reconcileById(prev.titles, tempId, item),
        }));
        setSelected((prev) =>
          prev?.kind === "title" && prev.id === tempId
            ? { kind: "title", id: item.id }
            : prev
        );
      }
      return res;
    });
    setTitleText("");
    clearSelection();
    setSelected({ kind: "title", id: tempId });
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
    const tempId = `s${Date.now()}`;
    const fromSec = project.words[a].startSample / project.sampleRate;
    const toSec = project.words[b].endSample / project.sampleRate;
    const optimistic: EditorStillItem = {
      id: tempId,
      assetId: chosenStillAsset,
      startSample: project.words[a].startSample,
      endSample: project.words[b].endSample,
      scale: 1.2,
      focusX: 0.5,
      focusY: 0.5,
    };
    setProject((prev) => ({
      ...prev,
      stills: [...(prev.stills ?? []), optimistic],
    }));
    enqueueSave(async () => {
      const res = await runGuiAction(project.slug, "still-add", {
        assetId: chosenStillAsset,
        fromSec,
        toSec,
      });
      if (res.ok) {
        const item = res.data.result as EditorStillItem;
        setProject((prev) => ({
          ...prev,
          stills: reconcileById(prev.stills, tempId, item),
        }));
        setSelected((prev) =>
          prev?.kind === "still" && prev.id === tempId
            ? { kind: "still", id: item.id }
            : prev
        );
      }
      return res;
    });
    clearSelection();
    setSelected({ kind: "still", id: tempId });
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
      setProject((prev) => ({
        ...prev,
        zooms: (prev.zooms ?? []).map((z) =>
          z.id === id ? { ...z, ...patch } : z
        ),
      }));
      // ID-scoped patch: only touches this one zoom's fields under the lock,
      // regardless of what else may have changed on the track meanwhile.
      enqueueSave(async () => {
        const res = await runGuiAction(project.slug, "zoom-set", {
          id,
          ...(patch.scale === undefined ? {} : { scale: patch.scale }),
          ...(patch.rampSec === undefined ? {} : { rampSec: patch.rampSec }),
          ...(patch.startSample === undefined
            ? {}
            : { fromSec: patch.startSample / project.sampleRate }),
          ...(patch.endSample === undefined
            ? {}
            : { toSec: patch.endSample / project.sampleRate }),
        });
        if (res.ok) {
          const item = res.data.result as EditorZoomItem;
          setProject((prev) => ({
            ...prev,
            zooms: reconcileById(prev.zooms, id, item),
          }));
        }
        return res;
      });
    },
    [enqueueSave, project, setProject]
  );

  const updateTitle = useCallback(
    (id: string, patch: Partial<EditorTitleItem>) => {
      setProject((prev) => ({
        ...prev,
        titles: (prev.titles ?? []).map((t) =>
          t.id === id ? { ...t, ...patch } : t
        ),
      }));
      enqueueSave(async () => {
        const res = await runGuiAction(project.slug, "title-set", {
          id,
          ...(patch.text === undefined ? {} : { text: patch.text }),
          ...(patch.position === undefined ? {} : { position: patch.position }),
          ...(patch.startSample === undefined
            ? {}
            : { fromSec: patch.startSample / project.sampleRate }),
          ...(patch.endSample === undefined
            ? {}
            : { toSec: patch.endSample / project.sampleRate }),
        });
        if (res.ok) {
          const item = res.data.result as EditorTitleItem;
          setProject((prev) => ({
            ...prev,
            titles: reconcileById(prev.titles, id, item),
          }));
        }
        return res;
      });
    },
    [enqueueSave, project, setProject]
  );

  const updateBroll = useCallback(
    (id: string, patch: Partial<EditorBrollItem>) => {
      setProject((prev) => ({
        ...prev,
        broll: (prev.broll ?? []).map((b) =>
          b.id === id ? { ...b, ...patch } : b
        ),
      }));
      enqueueSave(async () => {
        const res = await runGuiAction(project.slug, "broll-set", {
          id,
          ...(patch.assetId === undefined ? {} : { assetId: patch.assetId }),
          ...(patch.display === undefined ? {} : { display: patch.display }),
          ...(patch.audioMode === undefined
            ? {}
            : { audioMode: patch.audioMode }),
          ...(patch.startSample === undefined
            ? {}
            : { fromSec: patch.startSample / project.sampleRate }),
          ...(patch.endSample === undefined
            ? {}
            : { toSec: patch.endSample / project.sampleRate }),
          ...(patch.srcInSample === undefined
            ? {}
            : { srcInSec: patch.srcInSample / project.sampleRate }),
        });
        if (res.ok) {
          const item = res.data.result as EditorBrollItem;
          setProject((prev) => ({
            ...prev,
            broll: reconcileById(prev.broll, id, item),
          }));
        }
        return res;
      });
    },
    [enqueueSave, project, setProject]
  );

  const updateStill = useCallback(
    (id: string, patch: Partial<EditorStillItem>) => {
      setProject((prev) => ({
        ...prev,
        stills: (prev.stills ?? []).map((s) =>
          s.id === id ? { ...s, ...patch } : s
        ),
      }));
      enqueueSave(async () => {
        const res = await runGuiAction(project.slug, "still-set", {
          id,
          ...(patch.assetId === undefined ? {} : { assetId: patch.assetId }),
          ...(patch.scale === undefined ? {} : { scale: patch.scale }),
          ...(patch.focusX === undefined ? {} : { focusX: patch.focusX }),
          ...(patch.focusY === undefined ? {} : { focusY: patch.focusY }),
          ...(patch.startSample === undefined
            ? {}
            : { fromSec: patch.startSample / project.sampleRate }),
          ...(patch.endSample === undefined
            ? {}
            : { toSec: patch.endSample / project.sampleRate }),
        });
        if (res.ok) {
          const item = res.data.result as EditorStillItem;
          setProject((prev) => ({
            ...prev,
            stills: reconcileById(prev.stills, id, item),
          }));
        }
        return res;
      });
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
            const fromSec = timing.startSample / prev.sampleRate;
            const toSec = timing.endSample / prev.sampleRate;
            enqueueSave(async () => {
              const res = await runGuiAction(prev.slug, "zoom-set", {
                id,
                fromSec,
                toSec,
              });
              if (res.ok) {
                const item = res.data.result as EditorZoomItem;
                setProject((p) => ({
                  ...p,
                  zooms: reconcileById(p.zooms, id, item),
                }));
              }
              return res;
            });
          }
          return { ...prev, zooms };
        }
        if (kind === "broll") {
          const broll = (prev.broll ?? []).map((b) =>
            b.id === id ? { ...b, ...patch } : b
          );
          if (commit) {
            const fromSec = timing.startSample / prev.sampleRate;
            const toSec = timing.endSample / prev.sampleRate;
            enqueueSave(async () => {
              const res = await runGuiAction(prev.slug, "broll-set", {
                id,
                fromSec,
                toSec,
              });
              if (res.ok) {
                const item = res.data.result as EditorBrollItem;
                setProject((p) => ({
                  ...p,
                  broll: reconcileById(p.broll, id, item),
                }));
              }
              return res;
            });
          }
          return { ...prev, broll };
        }
        if (kind === "title") {
          const titles = (prev.titles ?? []).map((t) =>
            t.id === id ? { ...t, ...patch } : t
          );
          if (commit) {
            const fromSec = timing.startSample / prev.sampleRate;
            const toSec = timing.endSample / prev.sampleRate;
            enqueueSave(async () => {
              const res = await runGuiAction(prev.slug, "title-set", {
                id,
                fromSec,
                toSec,
              });
              if (res.ok) {
                const item = res.data.result as EditorTitleItem;
                setProject((p) => ({
                  ...p,
                  titles: reconcileById(p.titles, id, item),
                }));
              }
              return res;
            });
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
          const fromSec = timing.startSample / prev.sampleRate;
          const toSec = timing.endSample / prev.sampleRate;
          enqueueSave(async () => {
            const res = await runGuiAction(prev.slug, "still-set", {
              id,
              fromSec,
              toSec,
            });
            if (res.ok) {
              const item = res.data.result as EditorStillItem;
              setProject((p) => ({
                ...p,
                stills: reconcileById(p.stills, id, item),
              }));
            }
            return res;
          });
        }
        return { ...prev, stills };
      });
    },
    [enqueueSave, setProject]
  );

  // Whole-track op: paint-order restack genuinely needs to replace the full
  // b-roll array (dnd-kit hands back the complete new order). Guarded by a
  // compare-and-swap on the revision this browser last knew about, so a
  // stale drag-drop from before a concurrent CLI/MCP edit is rejected instead
  // of silently overwriting it (CRAFT-6177).
  const reorderBrollOrder = useCallback(
    (orderedIds: string[]) => {
      const map = new Map((project.broll ?? []).map((b) => [b.id, b]));
      const broll = orderedIds
        .map((id) => map.get(id))
        .filter((b): b is EditorBrollItem => Boolean(b));
      const expectedRevision = project.revision;
      setProject({ ...project, broll });
      enqueueSave(async () => {
        const res = await saveBroll(project.slug, broll, expectedRevision);
        if (res.ok) {
          setProject((prev) => ({
            ...prev,
            broll: res.data.broll as EditorBrollItem[],
            revision: res.data.revision,
          }));
        }
        return res;
      });
    },
    [enqueueSave, project, setProject]
  );

  const removeSelected = useCallback(() => {
    if (!selected) {
      return;
    }
    if (selected.kind === "zoom") {
      const id = selected.id;
      const zooms = (project.zooms ?? []).filter((z) => z.id !== id);
      setProject({ ...project, zooms });
      enqueueSave(() => runGuiAction(project.slug, "zoom-rm", { id }));
    } else if (selected.kind === "broll") {
      const id = selected.id;
      const broll = (project.broll ?? []).filter((b) => b.id !== id);
      setProject({ ...project, broll });
      enqueueSave(() => runGuiAction(project.slug, "broll-rm", { id }));
    } else if (selected.kind === "title") {
      const id = selected.id;
      const titles = (project.titles ?? []).filter((t) => t.id !== id);
      setProject({ ...project, titles });
      enqueueSave(() => runGuiAction(project.slug, "title-rm", { id }));
    } else if (selected.kind === "still") {
      const id = selected.id;
      const stills = (project.stills ?? []).filter((s) => s.id !== id);
      setProject({ ...project, stills });
      enqueueSave(() => runGuiAction(project.slug, "still-rm", { id }));
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
