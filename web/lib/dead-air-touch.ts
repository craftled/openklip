import type { DeadAirItem } from "@/lib/dead-air-state";

/** Mirrors engine `dead-air-add` result shape (`src/actions.ts`). */
export interface DeadAirTouch {
  created: boolean;
  span: DeadAirItem;
}

export function deadAirItemsFromTouches(
  touches: readonly DeadAirTouch[]
): DeadAirItem[] {
  return touches.map((touch) => touch.span);
}

export function createdDeadAirIdsFromTouches(
  touches: readonly DeadAirTouch[]
): string[] {
  return touches.filter((touch) => touch.created).map((touch) => touch.span.id);
}

export function mergeDeadAirTouches(
  batches: readonly (readonly DeadAirTouch[])[]
): DeadAirTouch[] {
  return batches.flatMap((batch) => [...batch]);
}
