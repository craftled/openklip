// Runs under Node (Transformers.js has first-class Node support). Reads raw
// f32le mono 16 kHz PCM, writes word-level transcript JSON. Kept separate from
// the Bun server so the ONNX runtime never has to load inside Bun.
import { readFileSync, writeFileSync } from "node:fs";
import { applyModelEnv, withModelRetry } from "./model-env.mjs";

const [, , rawPath, outPath, modelArg] = process.argv;
const MODEL = modelArg || "Xenova/whisper-base.en";

if (!(rawPath && outPath)) {
  console.error("usage: node transcribe.mjs <audio16k.f32> <out.json> [model]");
  process.exit(2);
}

const { pipeline, env } = await import("@huggingface/transformers");
applyModelEnv(env);

const buf = readFileSync(rawPath);
const audio = new Float32Array(
  buf.buffer,
  buf.byteOffset,
  Math.floor(buf.byteLength / 4)
);
console.error(
  `[transcribe] model=${MODEL} ~${(audio.length / 16_000).toFixed(1)}s of audio`
);

const transcriber = await withModelRetry(
  () => pipeline("automatic-speech-recognition", MODEL),
  {
    onRetry: (err, attempt, delay) =>
      console.error(
        `[transcribe] model load failed (attempt ${attempt}), retrying in ${delay}ms: ${err?.message ?? err}`
      ),
  }
);
const result = await transcriber(audio, {
  return_timestamps: "word",
  chunk_length_s: 30,
  stride_length_s: 5,
});

const chunks = (result.chunks || [])
  .map((c) => ({
    text: (c.text || "").trim(),
    start: Array.isArray(c.timestamp) ? c.timestamp[0] : null,
    end: Array.isArray(c.timestamp) ? c.timestamp[1] : null,
  }))
  .filter((c) => c.text.length > 0);

writeFileSync(
  outPath,
  JSON.stringify({ text: result.text || "", chunks }, null, 2)
);
console.error(`[transcribe] ${chunks.length} words -> ${outPath}`);
