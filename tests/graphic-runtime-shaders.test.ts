import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SHADER_IDS,
  shaderColorUniforms,
  shaderSpecFor,
} from "../web/lib/paper-shader-specs.ts";

test("shaderColorUniforms parses comma-separated colors with fallback", () => {
  const parsed = shaderColorUniforms("#000000, #ffffff", ["#ff0000"], 10);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], [0, 0, 0, 1]);
  assert.deepEqual(parsed[1], [1, 1, 1, 1]);

  const fallback = shaderColorUniforms("", ["#112233"], 10);
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0]?.[3], 1);
});

test("shaderSpecFor maps meshGradient params to uniforms", () => {
  const spec = shaderSpecFor("meshGradient", {
    colors: "#ff0000, #00ff00, #0000ff",
    speed: 1.5,
    scale: 1.2,
    distortion: 0.4,
    swirl: 0.3,
  });
  assert.equal(spec.speed, 1.5);
  assert.equal(spec.fragmentShader.length > 0, true);
  assert.equal(spec.uniforms.u_scale, 1.2);
  assert.equal(spec.uniforms.u_distortion, 0.4);
  assert.equal(spec.uniforms.u_swirl, 0.3);
  assert.equal(spec.uniforms.u_colorsCount, 3);
});

test("shaderSpecFor maps grainGradient shape and noise uniforms", () => {
  const spec = shaderSpecFor("grainGradient", {
    shape: "sphere",
    noise: 0.9,
    intensity: 0.2,
  });
  assert.equal(spec.uniforms.u_shape, 7);
  assert.equal(spec.uniforms.u_noise, 0.9);
  assert.equal(spec.uniforms.u_intensity, 0.2);
  assert.equal(spec.uniforms.u_colorsCount, 3);
});

test("shaderSpecFor maps dithering params and clamps size", () => {
  const spec = shaderSpecFor("dithering", {
    colors: "#101010, #f5f5f5",
    shape: "swirl",
    type: "2x2",
    size: 100,
    speed: 2,
  });
  assert.equal(spec.speed, 2);
  assert.equal(spec.uniforms.u_shape, 6);
  assert.equal(spec.uniforms.u_type, 2);
  assert.equal(spec.uniforms.u_pxSize, 20);
});

test("shaderSpecFor builds a spec for every bundled shader id", () => {
  for (const shaderId of SHADER_IDS) {
    const spec = shaderSpecFor(shaderId, { speed: 1, scale: 1 });
    assert.equal(spec.fragmentShader.length > 0, true, shaderId);
    assert.equal(typeof spec.speed, "number", shaderId);
    assert.equal(typeof spec.uniforms, "object", shaderId);
  }
});

test("shaderSpecFor maps colorPanels and liquidMetal shape uniforms", () => {
  const panels = shaderSpecFor("colorPanels", {
    colors: "#ff0000, #00ff00",
    density: 2.5,
  });
  assert.equal(panels.uniforms.u_colorsCount, 2);
  assert.equal(panels.uniforms.u_density, 2.5);

  const metal = shaderSpecFor("liquidMetal", { shape: "circle" });
  assert.equal(metal.uniforms.u_shape, 1);
  assert.equal(metal.uniforms.u_isImage, false);
});

test("shaderSpecFor maps pattern shaders with enum uniforms", () => {
  const warp = shaderSpecFor("warp", { shape: "stripes", swirl: 0.5 });
  assert.equal(warp.uniforms.u_shape, 1);
  assert.equal(warp.uniforms.u_swirl, 0.5);

  const dotGrid = shaderSpecFor("dotGrid", { shape: "triangle", size: 4 });
  assert.equal(dotGrid.uniforms.u_shape, 3);
  assert.equal(dotGrid.uniforms.u_dotSize, 4);
});
