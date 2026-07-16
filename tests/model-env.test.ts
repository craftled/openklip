// Unit coverage for the pure model-loading helpers (src/model-env.mjs) that
// keep transcribe/embed off huggingface.co in CI. The real model loads are
// network-bound and covered by the cam acceptance tests running offline against
// the warmed cache; here we prove the env wiring and the retry policy in
// isolation, with no network and no real delays.
import { expect, test } from "bun:test";
import {
  applyModelEnv,
  isOffline,
  isTransientModelError,
  withModelRetry,
} from "../src/model-env.mjs";

function fakeEnv() {
  return {
    allowLocalModels: undefined,
    allowRemoteModels: undefined,
    cacheDir: undefined,
    localModelPath: undefined,
  } as {
    allowLocalModels?: boolean;
    allowRemoteModels?: boolean;
    cacheDir?: string;
    localModelPath?: string;
  };
}

test("applyModelEnv pins the download cache and stays online by default", () => {
  const env = fakeEnv();
  applyModelEnv(env, { OPENKLIP_MODEL_CACHE: "/tmp/models" });
  expect(env.allowLocalModels).toBe(false);
  expect(env.cacheDir).toBe("/tmp/models");
  // No offline flag -> remote stays allowed (undefined, i.e. the lib default).
  expect(env.allowRemoteModels).toBeUndefined();
});

test("offline + cache dir loads from the warmed cache as localModelPath", () => {
  // The critical CI path: remote forbidden, model resolved from the warmed
  // cache dir (which Transformers.js reads via localModelPath, not cacheDir).
  const env = fakeEnv();
  applyModelEnv(env, {
    TRANSFORMERS_OFFLINE: "1",
    OPENKLIP_MODEL_CACHE: "/tmp/models",
  });
  expect(env.allowRemoteModels).toBe(false);
  expect(env.allowLocalModels).toBe(true);
  expect(env.localModelPath).toBe("/tmp/models");
  expect(env.cacheDir).toBe("/tmp/models");
});

test("offline without a cache dir forbids remote AND local (explicit miss)", () => {
  const a = fakeEnv();
  applyModelEnv(a, { TRANSFORMERS_OFFLINE: "1" });
  expect(a.allowRemoteModels).toBe(false);
  expect(a.allowLocalModels).toBe(false);
  expect(a.localModelPath).toBeUndefined();

  const b = fakeEnv();
  applyModelEnv(b, { HF_HUB_OFFLINE: "1" });
  expect(b.allowRemoteModels).toBe(false);
  expect(b.allowLocalModels).toBe(false);
});

test("applyModelEnv leaves cacheDir untouched when no override is given", () => {
  const env = fakeEnv();
  applyModelEnv(env, {});
  expect(env.cacheDir).toBeUndefined();
  expect(env.allowLocalModels).toBe(false);
});

test("isOffline reads both conventional flags, only for the value '1'", () => {
  expect(isOffline({ TRANSFORMERS_OFFLINE: "1" })).toBe(true);
  expect(isOffline({ HF_HUB_OFFLINE: "1" })).toBe(true);
  expect(isOffline({ TRANSFORMERS_OFFLINE: "0" })).toBe(false);
  expect(isOffline({})).toBe(false);
});

test("isTransientModelError matches network blips but not permanent failures", () => {
  expect(
    isTransientModelError(
      new Error(
        'Gateway timeout error occurred while trying to load file: "config.json".'
      )
    )
  ).toBe(true);
  expect(isTransientModelError(new Error("fetch failed"))).toBe(true);
  expect(isTransientModelError(new Error("ECONNRESET"))).toBe(true);
  expect(
    isTransientModelError(new Error("request failed with status 503"))
  ).toBe(true);
  // Permanent errors must NOT be retried.
  expect(
    isTransientModelError(new Error("Could not locate file whisper-base.en"))
  ).toBe(false);
  expect(isTransientModelError(new Error("Unknown model id"))).toBe(false);
  // A 512-dim mention must not be mistaken for a 5xx status.
  expect(isTransientModelError(new Error("embedding dim 512 mismatch"))).toBe(
    false
  );
});

test("withModelRetry returns immediately on success (no retries)", async () => {
  let calls = 0;
  const result = await withModelRetry(
    () => {
      calls++;
      return Promise.resolve("model");
    },
    { sleepFn: () => Promise.resolve() }
  );
  expect(result).toBe("model");
  expect(calls).toBe(1);
});

test("withModelRetry retries transient failures then succeeds", async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await withModelRetry(
    () => {
      calls++;
      if (calls < 3) {
        return Promise.reject(new Error("gateway timeout"));
      }
      return Promise.resolve("model");
    },
    {
      baseDelayMs: 10,
      sleepFn: (ms: number) => {
        delays.push(ms);
        return Promise.resolve();
      },
    }
  );
  expect(result).toBe("model");
  expect(calls).toBe(3);
  // Exponential backoff, deterministic: 10ms then 20ms.
  expect(delays).toEqual([10, 20]);
});

test("withModelRetry gives up after `attempts` transient failures", async () => {
  let calls = 0;
  await expect(
    withModelRetry(
      () => {
        calls++;
        return Promise.reject(new Error("gateway timeout"));
      },
      { attempts: 3, baseDelayMs: 1, sleepFn: () => Promise.resolve() }
    )
  ).rejects.toThrow(/gateway timeout/);
  expect(calls).toBe(3);
});

test("withModelRetry does NOT retry a permanent error", async () => {
  let calls = 0;
  await expect(
    withModelRetry(
      () => {
        calls++;
        return Promise.reject(new Error("offline cache miss: file not found"));
      },
      { sleepFn: () => Promise.resolve() }
    )
  ).rejects.toThrow(/file not found/);
  expect(calls).toBe(1);
});
