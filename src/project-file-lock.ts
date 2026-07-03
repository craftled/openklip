// Cross-process advisory lockfile for project.json mutations.
//
// Same pattern as the tasks.json lock in src/agent-tasks.ts: an exclusive
// O_CREAT|O_EXCL ("wx") open makes the acquire atomic on POSIX. A crashed
// process leaves the lockfile behind; a stale one (mtime > LOCK_STALE_MS) is
// broken once so two waiters cannot ping-pong removing each other's fresh locks.
//
// Usage: call acquireProjectFileLock(lockPath) INSIDE a withProjectLock
// callback. mutateProject in src/projectStore.ts does this; callers that only
// read project.json do not need either lock.
//
// See src/project-lock.ts for the in-process serialization layer.
import { open, stat, unlink } from "node:fs/promises";

export const PROJECT_LOCK_RETRY_MS = 50;
export const PROJECT_LOCK_TIMEOUT_MS = 3000;
export const PROJECT_LOCK_STALE_MS = 10_000;

/** Acquire an exclusive advisory lockfile at `lockPath`.
 *
 * Spins with LOCK_RETRY_MS sleep until either:
 *  - the lock is free (no file) and is created successfully, or
 *  - the existing lock's mtime is older than LOCK_STALE_MS (crashed holder)
 *    and is removed (once), or
 *  - LOCK_TIMEOUT_MS elapses, in which case an error is thrown with the
 *    message: "timed out waiting for the project.json lock: <lockPath>"
 *
 * Callers must release the lock with `unlink(lockPath)` in a finally block. */
export async function acquireProjectFileLock(lockPath: string): Promise<void> {
  const deadline = Date.now() + PROJECT_LOCK_TIMEOUT_MS;
  let brokeStale = false;
  for (;;) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.write(String(process.pid));
      } finally {
        await handle.close();
      }
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
        throw e;
      }
    }
    if (!brokeStale) {
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > PROJECT_LOCK_STALE_MS) {
          brokeStale = true;
          try {
            await unlink(lockPath);
          } catch {
            // Another waiter broke it first; retry the open.
          }
          continue;
        }
      } catch {
        // The holder released between our open attempt and stat; retry immediately.
        continue;
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `timed out waiting for the project.json lock: ${lockPath}`
      );
    }
    await new Promise<void>((resolve) =>
      setTimeout(resolve, PROJECT_LOCK_RETRY_MS)
    );
  }
}
