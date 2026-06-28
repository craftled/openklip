// Serializes project.json mutations that flow through the asset endpoints
// (folder sync + upload) on a per-slug basis. Without this, two overlapping
// sync polls (or a sync racing an upload) both read project.json, each
// registers a different asset, and the second save clobbers the first — a
// lost update. The chain keeps calls strictly ordered; a failing call never
// blocks subsequent ones.
const tails = new Map<string, Promise<unknown>>();

export function withAssetLock<T>(
  slug: string,
  fn: () => Promise<T>
): Promise<T> {
  const tail = tails.get(slug) ?? Promise.resolve();
  const result = tail.then(() => fn());
  const nextTail = result.then(
    () => undefined,
    () => undefined
  );
  tails.set(slug, nextTail);
  nextTail.then(() => {
    if (tails.get(slug) === nextTail) {
      tails.delete(slug);
    }
  });
  return result;
}
