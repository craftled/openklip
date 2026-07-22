// In-memory registry mapping a running agent task id to its spawned CLI
// process, so a cancel request (the tasks API route) can kill the live
// process. State is per-process in memory, like src/ingest-jobs.ts: it does
// not survive a server restart. A task still marked "running" in tasks.json
// after a restart has no live process to kill here; cancelling it just marks
// the stored record cancelled (killAgentRun best-effort returns false).

/** The minimal shape the registry needs from a spawned agent process. */
export interface AgentRunProcess {
  kill: () => void;
}

const runs = new Map<string, AgentRunProcess>();

/** Register the process backing a running task, so it can later be killed. */
export function registerAgentRun(taskId: string, proc: AgentRunProcess): void {
  runs.set(taskId, proc);
}

/** Drop the registry entry without killing the process (e.g. it exited on its own). */
export function clearAgentRun(taskId: string): void {
  runs.delete(taskId);
}

/** Kill and clear the registered process for a task. Returns false if none is registered. */
export function killAgentRun(taskId: string): boolean {
  const proc = runs.get(taskId);
  if (!proc) {
    return false;
  }
  proc.kill();
  runs.delete(taskId);
  return true;
}
