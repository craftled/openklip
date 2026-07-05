import type { Project as EngineProject } from "@engine/edl";
import { reanchorProject } from "../../src/reanchor.ts";

function cloneAnchoredOverlays<T extends object>(list: readonly T[]): T[] {
  return list.map((item) => {
    const anchor = (item as { anchor?: { phrase: string } }).anchor;
    return anchor ? { ...item, anchor: { ...anchor } } : { ...item };
  });
}

/** Optimistic mirror of cut/cut-text: flip deleted flags, then reanchor overlays. */
export function reanchoredWordUpdate(
  prev: EngineProject,
  ids: ReadonlySet<string>,
  deleted: boolean
): EngineProject {
  const next = {
    ...prev,
    words: prev.words.map((w) => (ids.has(w.id) ? { ...w, deleted } : w)),
    broll: cloneAnchoredOverlays(prev.broll ?? []),
    titles: cloneAnchoredOverlays(prev.titles ?? []),
    zooms: cloneAnchoredOverlays(prev.zooms ?? []),
    stills: prev.stills ? cloneAnchoredOverlays(prev.stills) : prev.stills,
    graphics: prev.graphics
      ? cloneAnchoredOverlays(prev.graphics)
      : prev.graphics,
  };
  reanchorProject(next);
  return next;
}
