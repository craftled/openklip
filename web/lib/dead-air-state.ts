export interface DeadAirItem {
  endSample: number;
  id: string;
  startSample: number;
}

export function reconcileDeadAirItems(
  current: readonly DeadAirItem[],
  created: readonly DeadAirItem[],
  isOptimistic: (id: string) => boolean
): DeadAirItem[] {
  const createdIds = new Set(created.map((item) => item.id));
  return [
    ...current.filter(
      (item) => !(isOptimistic(item.id) || createdIds.has(item.id))
    ),
    ...created,
  ];
}
