// Shared model-loading helpers for the Node-side Transformers.js scripts
// (src/transcribe.mjs, src/embed.mjs, scripts/warm-models.mjs). Two concerns:
//
//   1. Cache + offline control (CRAFT-6243). The test suite used to
//      re-download Whisper/CLIP from huggingface.co on every run, so a live HF
//      gateway timeout failed unrelated PRs. `OPENKLIP_MODEL_CACHE` points the
//      Transformers.js download cache at a stable dir that CI persists across
//      runs and warms once; `TRANSFORMERS_OFFLINE`/`HF_HUB_OFFLINE=1` forbids
//      remote fetches so a warmed cache is used and the network is never
//      touched. The download cache is separate from `localModelPath`, so
//      `allowLocalModels` stays false (unchanged behavior) while the cache is
//      still consulted offline.
//   2. Transient-failure retry. Even with the network allowed, a single
//      504/gateway-timeout blip shouldn't fail a load: withModelRetry retries a
//      few times with exponential backoff, but only for transient network
//      errors — a bad model id or an offline cache miss throws immediately
//      rather than wasting minutes retrying a permanent failure.
//
// Pure (no @huggingface/transformers import) so it loads under bun:test without
// pulling in the ONNX runtime.

/** Configure the Transformers.js `env` from process env. Idempotent. */
export function applyModelEnv(env, processEnv = process.env) {
  const cacheDir = processEnv.OPENKLIP_MODEL_CACHE;
  if (cacheDir) {
    env.cacheDir = cacheDir;
  }
  if (isOffline(processEnv) && cacheDir) {
    // Fully offline against the warmed cache. When remote is disallowed,
    // Transformers.js resolves models from `localModelPath` (NOT the
    // remote-download `cacheDir`), gated by `allowLocalModels`. The warmed
    // cache uses the same `<root>/<modelId>/<file>` layout, so point
    // `localModelPath` at it and allow local loads — the network is never
    // touched.
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = cacheDir;
  } else {
    // Online (default) path: only the remote hub + its download cache; never a
    // user-supplied localModelPath. Preserves prior behavior.
    env.allowLocalModels = false;
    if (isOffline(processEnv)) {
      // Offline requested but no cache dir to read from: forbid remote so the
      // failure is an explicit local-miss rather than a surprise network call.
      env.allowRemoteModels = false;
    }
  }
  return env;
}

export function isOffline(processEnv = process.env) {
  return (
    processEnv.TRANSFORMERS_OFFLINE === "1" || processEnv.HF_HUB_OFFLINE === "1"
  );
}

// Textual/status signatures of a transient network failure worth retrying.
// Kept narrow so a permanent error (unknown model, offline cache miss, disk)
// falls through and throws on the first try.
const TRANSIENT_PATTERNS = [
  /gateway timeout/i,
  /timed?\s?out|timeout/i,
  /fetch failed/i,
  /network|socket hang up/i,
  /ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i,
  /\b(408|429|502|503|504)\b/,
];

export function isTransientModelError(err) {
  const msg = String(err?.message ?? err ?? "");
  return TRANSIENT_PATTERNS.some((re) => re.test(msg));
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run a model-loading thunk, retrying only transient network failures with
 * exponential backoff. Deterministic (no jitter) and injectable sleep so the
 * retry policy is unit-testable without real delays or a real network.
 */
export async function withModelRetry(load, opts = {}) {
  const {
    attempts = 4,
    baseDelayMs = 1000,
    onRetry = null,
    sleepFn = defaultSleep,
    isTransient = isTransientModelError,
  } = opts;
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await load();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts || !isTransient(err)) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      if (onRetry) {
        onRetry(err, attempt, delay);
      }
      await sleepFn(delay);
    }
  }
  throw lastErr;
}
