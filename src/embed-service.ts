// Warm embed-worker manager: keeps one long-lived `node embed.mjs serve`
// child alive across requests so repeat queries pay only inference latency
// (~10-50ms) instead of the ~2-5s CLIP model load a one-shot spawn repays
// every time (see embedQueryText in src/moment-search.ts, still used by the
// CLI, which does exactly that one-shot spawn). The Next server runs under
// Bun (package.json's dev/start scripts) and never loads ONNX inside Bun
// itself (mirrors src/transcribe.mjs's header rationale) : this module only
// ever talks to the child over stdio, never imports @huggingface/transformers.
import type { Subprocess } from "bun";
import { embedScriptPath } from "./script-paths.ts";

const REQUEST_TIMEOUT_MS = 30_000;

// ── Line-delimited JSON protocol (pure: unit-testable without spawning) ───
// Wire shape, both directions:
//   -> stdin  {"id":"...","text":"..."}\n
//   <- stdout {"id":"...","model":"...","dim":N,"vector":[...]}\n
//          or {"id":"...","error":"..."}\n on a per-request failure

export interface EmbedServeRequest {
  id: string;
  text: string;
}

export interface EmbedServeResponse {
  dim: number;
  error?: string;
  id: string;
  model?: string;
  vector?: number[];
}

// Split a raw stdout chunk buffer into complete lines plus a trailing
// partial line to prepend to the next chunk. Any line-delimited stdout
// reader needs this: chunk boundaries from a pipe never line up with
// message boundaries. Blank lines (e.g. a stray trailing "\n") are dropped
// from `complete` since they never carry a message.
export function splitLines(buffered: string): {
  complete: string[];
  rest: string;
} {
  const parts = buffered.split("\n");
  const rest = parts.pop() ?? "";
  return { complete: parts.filter((line) => line.length > 0), rest };
}

// Parse one stdout line into a response, or null when the line is not a
// well-formed protocol message. Defensive by design: a stray log line that
// leaked onto stdout, a partial write, or a malformed child should not crash
// the service, just be dropped (the corresponding request then times out
// via REQUEST_TIMEOUT_MS instead of hanging forever).
export function parseEmbedServeResponse(
  line: string
): EmbedServeResponse | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.id !== "string") {
    return null;
  }
  if (typeof obj.error === "string") {
    return { id: obj.id, dim: 0, error: obj.error };
  }
  if (
    typeof obj.model !== "string" ||
    typeof obj.dim !== "number" ||
    !Array.isArray(obj.vector) ||
    !obj.vector.every((v) => typeof v === "number")
  ) {
    return null;
  }
  return {
    id: obj.id,
    model: obj.model,
    dim: obj.dim,
    vector: obj.vector as number[],
  };
}

// Encode one request line. Builds a fresh object (rather than
// JSON.stringify(req) directly) so the on-wire key order is always
// {id, text}, regardless of how the caller constructed the input object.
export function encodeEmbedServeRequest(req: EmbedServeRequest): string {
  return `${JSON.stringify({ id: req.id, text: req.text })}\n`;
}

// ── Warm worker singleton (Bun-side IO boundary: spawn + stdio) ───────────

type EmbedChild = Subprocess<"pipe", "pipe", "inherit">;

interface PendingRequest {
  reject: (err: Error) => void;
  resolve: (result: EmbedTextResult) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export interface EmbedTextResult {
  model: string;
  vector: Float32Array;
}

let child: EmbedChild | null = null;
let nextId = 0;
const pending = new Map<string, PendingRequest>();
let stdoutBuffer = "";
let writeChain: Promise<void> = Promise.resolve();

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

function failAllPending(err: Error): void {
  for (const [id, req] of pending) {
    clearTimeout(req.timeout);
    req.reject(err);
    pending.delete(id);
  }
}

// Drop the current child reference and fail whatever was still waiting on
// it. The next embedText() call sees `child === null` and respawns.
function resetChild(err: Error): void {
  failAllPending(err);
  child = null;
  stdoutBuffer = "";
}

async function readLoop(proc: EmbedChild): Promise<void> {
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      stdoutBuffer += decoder.decode(value, { stream: true });
      const { complete, rest } = splitLines(stdoutBuffer);
      stdoutBuffer = rest;
      for (const line of complete) {
        const resp = parseEmbedServeResponse(line);
        if (!resp) {
          continue;
        }
        const req = pending.get(resp.id);
        if (!req) {
          continue;
        }
        clearTimeout(req.timeout);
        pending.delete(resp.id);
        if (resp.error || !(resp.vector && resp.model)) {
          req.reject(
            new Error(resp.error ?? "moment embed worker returned no vector")
          );
        } else {
          req.resolve({
            vector: Float32Array.from(resp.vector),
            model: resp.model,
          });
        }
      }
    }
    // stdout closed: the child exited on its own. Fail anything still
    // in flight so callers don't hang; the next embedText() respawns.
    resetChild(new Error("moment embed worker exited"));
  } catch (e) {
    resetChild(toError(e));
  }
}

function spawnChild(): EmbedChild {
  const proc = Bun.spawn(["node", embedScriptPath(), "serve"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
  }) as EmbedChild;
  void readLoop(proc);
  void proc.exited.then(() => {
    resetChild(new Error("moment embed worker exited"));
  });
  return proc;
}

function ensureChild(): EmbedChild {
  if (!child) {
    stdoutBuffer = "";
    child = spawnChild();
  }
  return child;
}

// Embed one text query through the warm worker, spawning it on first use and
// reusing it after. Serializes writes onto the child's stdin so concurrent
// calls can't interleave mid-line, but requests still queue independently
// (keyed by an incrementing id) so out-of-order responses would still
// resolve the right caller - defensive even though the child processes its
// stdin strictly in order.
export function embedText(text: string): Promise<EmbedTextResult> {
  const proc = ensureChild();
  const id = String(nextId++);
  const line = encodeEmbedServeRequest({ id, text });

  return new Promise<EmbedTextResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error("moment embed worker request timed out"));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timeout });

    writeChain = writeChain.then(async () => {
      try {
        await proc.stdin.write(line);
        await proc.stdin.flush();
      } catch (e) {
        const pendingReq = pending.get(id);
        if (pendingReq) {
          clearTimeout(pendingReq.timeout);
          pending.delete(id);
          pendingReq.reject(toError(e));
        }
      }
    });
  });
}

// Kill the warm child (if any) and fail anything still in flight. Exported
// for tests so a suite that spawns the real worker can clean up instead of
// leaving a node process running past the test file.
export async function shutdownEmbedService(): Promise<void> {
  const proc = child;
  child = null;
  failAllPending(new Error("moment embed worker shut down"));
  if (proc) {
    proc.kill();
    await proc.exited.catch(() => {
      // already exiting; nothing to do
    });
  }
}
