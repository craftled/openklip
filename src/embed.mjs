// Runs under Node (Transformers.js has first-class Node support). Embeds
// ingest frame JPEGs and free-text search queries into one shared CLIP
// embedding space for local, no-network visual moment search. Kept separate
// from the Bun server so the ONNX runtime never has to load inside Bun
// (mirrors src/transcribe.mjs).
import { readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , cmd, ...rest] = process.argv;

function usageExit() {
  console.error(
    "usage: node embed.mjs index <framesDir> <outJson> [model]\n" +
      "       node embed.mjs query <text> [model]"
  );
  process.exit(2);
}

if (cmd !== "index" && cmd !== "query") {
  usageExit();
}

const isIndex = cmd === "index";
const [arg1, arg2, arg3] = rest;
if (isIndex && !(arg1 && arg2)) {
  usageExit();
}
if (!(isIndex || arg1)) {
  usageExit();
}

// Tried Xenova/siglip-base-patch16-224 first, per the moment-search brief.
// The installed transformers.js (4.2.0) only exposes bare SiglipTextModel /
// SiglipVisionModel classes for standalone use: raw pooler_output, no
// projection head, and no documented single-modality joint-embedding
// guarantee (the combined SiglipModel needs BOTH text and pixel inputs at
// once to produce the shared text_embeds/image_embeds pair). That is the
// "unsupported/awkward" case the brief says to fall back from. Instead,
// Xenova/clip-vit-base-patch32 ships CLIPTextModelWithProjection and
// CLIPVisionModelWithProjection: two independently documented heads that
// each project into the SAME 512-dim space, which is exactly what "index
// frames once, query with arbitrary text later" needs.
const MOMENT_MODEL = "Xenova/clip-vit-base-patch32";
const model = (isIndex ? arg3 : arg2) || MOMENT_MODEL;

// Mirrors FRAME_STEP_SEC in src/scene-log.ts (ffmpeg extracts one frame
// every 3s at ingest: fps=1/3). This script runs under plain Node and
// cannot import that .ts constant, so the value is duplicated here by hand;
// keep the two in sync.
const FRAME_STEP_SEC = 3;

const {
  env,
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
} = await import("@huggingface/transformers");
env.allowLocalModels = false;

function l2Normalize(values) {
  let sumSquares = 0;
  for (const v of values) {
    sumSquares += v * v;
  }
  const norm = Math.sqrt(sumSquares) || 1;
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    out[i] = values[i] / norm;
  }
  return out;
}

function frameAtSec(fileName) {
  const index1Based = Number.parseInt(fileName.replace(/\D/g, ""), 10) || 1;
  return Math.max(0, (index1Based - 1) * FRAME_STEP_SEC);
}

if (!isIndex) {
  const text = arg1;
  console.error(`[embed] model=${model} query="${text}"`);
  const tokenizer = await AutoTokenizer.from_pretrained(model);
  const textModel = await CLIPTextModelWithProjection.from_pretrained(model);
  const inputs = tokenizer([text], { padding: true, truncation: true });
  const { text_embeds } = await textModel(inputs);
  const vector = l2Normalize(Float32Array.from(text_embeds.data));
  process.stdout.write(
    `${JSON.stringify({
      model,
      dim: vector.length,
      vector: Array.from(vector),
    })}\n`
  );
  process.exit(0);
}

const framesDir = arg1;
const outJson = arg2;
const files = readdirSync(framesDir)
  .filter((f) => f.toLowerCase().endsWith(".jpg"))
  .sort();
console.error(
  `[embed] model=${model} ${files.length} frame(s) in ${framesDir}`
);

let dim = 0;
let flat = new Float32Array(0);
if (files.length > 0) {
  const processor = await AutoProcessor.from_pretrained(model);
  const visionModel =
    await CLIPVisionModelWithProjection.from_pretrained(model);
  const vectors = [];
  for (let i = 0; i < files.length; i++) {
    const image = await RawImage.read(join(framesDir, files[i]));
    const inputs = await processor(image);
    const { image_embeds } = await visionModel(inputs);
    const vector = l2Normalize(Float32Array.from(image_embeds.data));
    dim = vector.length;
    vectors.push(vector);
    if ((i + 1) % 25 === 0 || i === files.length - 1) {
      console.error(`[embed]   ${i + 1}/${files.length}`);
    }
  }
  flat = new Float32Array(vectors.length * dim);
  vectors.forEach((vector, i) => {
    flat.set(vector, i * dim);
  });
}

const index = {
  version: 1,
  model,
  dim,
  frameStepSec: FRAME_STEP_SEC,
  frames: files.map((name) => ({ name, atSec: frameAtSec(name) })),
  vectorsB64: Buffer.from(
    flat.buffer,
    flat.byteOffset,
    flat.byteLength
  ).toString("base64"),
};

const tmpPath = `${outJson}.tmp`;
writeFileSync(tmpPath, JSON.stringify(index));
renameSync(tmpPath, outJson);
console.error(`[embed] ${files.length} frame(s) -> ${outJson}`);
