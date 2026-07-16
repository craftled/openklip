// CI model warmer: populate the Transformers.js download cache once so the
// test suite doesn't re-fetch Whisper/CLIP from huggingface.co on every run
// (see src/model-env.mjs). Run after `bun install`, before the tests, with
// OPENKLIP_MODEL_CACHE set and WITHOUT the offline flag — this is the single
// step allowed to touch the network; the test steps then run offline against
// the warmed cache. On a cache hit this is a fast, offline no-op; on a miss it
// downloads with generous retries so a transient HF blip doesn't fail the job.
import { applyModelEnv, withModelRetry } from "../src/model-env.mjs";

// Defaults mirror src/transcribe.mjs (whisper) and src/embed.mjs (clip); the
// env overrides let a caller warm a different pinned model without code edits.
const WHISPER = process.env.OPENKLIP_WHISPER_MODEL || "Xenova/whisper-base.en";
const CLIP =
  process.env.OPENKLIP_MOMENT_MODEL || "Xenova/clip-vit-base-patch32";

const {
  env,
  pipeline,
  AutoTokenizer,
  AutoProcessor,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
} = await import("@huggingface/transformers");
applyModelEnv(env);

const onRetry = (err, attempt, delay) =>
  console.error(
    `[warm] load failed (attempt ${attempt}), retrying in ${delay}ms: ${err?.message ?? err}`
  );
const retry = (load) =>
  withModelRetry(load, { attempts: 6, baseDelayMs: 2000, onRetry });

console.error(
  `[warm] cache=${env.cacheDir ?? "(default)"} remote=${env.allowRemoteModels !== false} whisper=${WHISPER} clip=${CLIP}`
);

await retry(() => pipeline("automatic-speech-recognition", WHISPER));
console.error("[warm] whisper ready");

await retry(() => AutoTokenizer.from_pretrained(CLIP));
await retry(() => CLIPTextModelWithProjection.from_pretrained(CLIP));
await retry(() => AutoProcessor.from_pretrained(CLIP));
await retry(() => CLIPVisionModelWithProjection.from_pretrained(CLIP));
console.error("[warm] clip ready");

console.error("[warm] done");
