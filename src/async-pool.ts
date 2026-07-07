// Small order-preserving async mapper with a bounded number of active workers.
// Use this for expensive local work where Promise.all would fan out too much
// process, disk, network, or memory pressure at once.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("concurrency limit must be a positive integer");
  }
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      if (index >= items.length) {
        return;
      }
      next += 1;
      results[index] = await fn(items[index], index);
    }
  };

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
