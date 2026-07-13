import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { runCamDevexSmoke } from "../src/cam-devex-smoke.ts";
import { FFMPEG } from "../src/ffmpeg.ts";

describe("cam devex smoke", () => {
  test("lavfi twin-cam mix plus override gate", async () => {
    if (typeof FFMPEG !== "string" || !existsSync(FFMPEG)) {
      return;
    }

    const result = await runCamDevexSmoke();
    for (const step of result.steps) {
      expect(step.ok, `${step.name}: ${step.detail}`).toBe(true);
    }
    expect(result.ok).toBe(true);
  }, 180_000);
});
