// Per-slug in-process mutexes for project.json and chats.json mutations.
//
// Why: the editor server handles concurrent requests (multiple browser tabs,
// agent sessions, folder-sync polls). Each mutation is a read-modify-write of
// a JSON file; without serialization two overlapping writes clobber each other
// and one edit is lost. Chaining calls per slug on a promise queue makes them
// strictly ordered. A failing call never blocks subsequent ones.
//
// project.json and chats.json get separate locks so a long-running project
// mutation (e.g. an agent suggestion that shells out) doesn't block chat
// writes: they touch different files and don't conflict.
//
// Scope: this serializes within one process (one running server). Concurrent
// processes (two CLI invocations, or a CLI agent and the server) write the
// same files and need OS-level file locking; see the note in the PR.
function chain<T>(
  map: Map<string, Promise<unknown>>,
  slug: string,
  fn: () => T | Promise<T>
): Promise<T> {
  const tail = map.get(slug) ?? Promise.resolve();
  const result = tail.then(() => fn());
  const nextTail = result.then(
    () => undefined,
    () => undefined
  );
  map.set(slug, nextTail);
  nextTail.then(() => {
    if (map.get(slug) === nextTail) {
      map.delete(slug);
    }
  });
  return result;
}

const projectTails = new Map<string, Promise<unknown>>();
const chatsTails = new Map<string, Promise<unknown>>();

/** Serialize project.json mutations for one slug. */
export function withProjectLock<T>(
  slug: string,
  fn: () => T | Promise<T>
): Promise<T> {
  return chain(projectTails, slug, fn);
}

/** Serialize chats.json mutations for one slug. */
export function withChatsLock<T>(
  slug: string,
  fn: () => T | Promise<T>
): Promise<T> {
  return chain(chatsTails, slug, fn);
}
