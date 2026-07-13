#!/usr/bin/env bun
import { runCamDevexSmoke } from "../src/cam-devex-smoke.ts";

try {
  const result = await runCamDevexSmoke();
  console.log("\ncam-devex-smoke");
  for (const step of result.steps) {
    const tag = step.ok ? "ok" : "FAIL";
    console.log(`[${tag}] ${step.name}: ${step.detail}`);
  }
  if (!result.ok) {
    console.error("\ncam-devex-smoke: failed");
    process.exit(1);
  }
  console.log("\ncam-devex-smoke: passed");
} catch (error) {
  console.error(`\nerror: ${(error as Error).message}\n`);
  process.exit(1);
}
