import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lottiePocTemplateDoc,
  validateLottieGraphicTemplate,
} from "../src/lottie-graphic.ts";

const minimalLottie = {
  v: "5.12.0",
  fr: 30,
  ip: 0,
  op: 90,
  w: 1920,
  h: 1080,
  assets: [],
  layers: [],
};

test("validateLottieGraphicTemplate accepts a transparent project-local graphic POC", () => {
  const result = validateLottieGraphicTemplate({
    lottie: minimalLottie,
    manifest: {
      id: "lottie-lower-third",
      kind: "rich",
      width: 1920,
      height: 1080,
      fps: 30,
      params: {
        text: { type: "string", default: "OpenKlip" },
        accent: { type: "string", default: "#00aaff" },
      },
      lottie: {
        file: "scene.json",
        transparent: true,
        slots: {
          text: { param: "text", path: "layers.title.t.d.k[0].s.t" },
          accent: { param: "accent", path: "layers.shape.c.k" },
        },
      },
    },
  });

  assert.deepEqual(result.issues, []);
  assert.equal(result.ok, true);
});

test("validateLottieGraphicTemplate reports missing transparency, blank canvas, assets, and frame bounds", () => {
  const result = validateLottieGraphicTemplate({
    lottie: {
      ...minimalLottie,
      w: 0,
      h: 0,
      fr: 0,
      op: 0,
      assets: [{ id: "font-or-image", p: "missing.png" }],
    },
    manifest: {
      id: "bad-lottie",
      kind: "rich",
      width: 1920,
      height: 1080,
      fps: 30,
      params: {},
      lottie: {
        file: "scene.json",
        transparent: false,
        slots: {
          title: { param: "missing", path: "" },
        },
      },
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /blank canvas/i);
  assert.match(result.issues.join("\n"), /transparent/i);
  assert.match(result.issues.join("\n"), /external assets/i);
  assert.match(result.issues.join("\n"), /frame bounds/i);
  assert.match(result.issues.join("\n"), /slot/i);
});

test("lottie POC docs keep Lottie out of AssetKind for now", () => {
  assert.match(lottiePocTemplateDoc, /project-local graphic template/i);
  assert.match(lottiePocTemplateDoc, /not a new AssetKind/i);
});
