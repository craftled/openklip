// Pure reorder used by the dnd-kit drag handler: move `activeId` to the slot
// currently held by `overId`, preserving the order of everything else. Returns a
// new id array (no mutation). No-op when either id is unknown or they're equal.
// Kept out of the component so the reorder logic is unit-testable without a DOM.
export function applyDragReorder(
  ids: string[],
  activeId: string,
  overId: string
): string[] {
  if (activeId === overId) {
    return ids;
  }
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1) {
    return ids;
  }
  const next = ids.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
