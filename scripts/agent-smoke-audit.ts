#!/usr/bin/env bun
/**
 * Deterministic agent-loop smoke audit (no LLM):
 * lavfi fixture: brief → cleanup apply-safe → export → structural verify.
 * --real: edgaras-raw when present (read-only + export).
 * --all: lavfi then --real.
 */
import {
  runAgentSmokeAudit,
  runRealFixtureSmokeAudit,
} from "../src/agent-smoke-audit.ts";

const fullVerify = process.argv.includes("--full-verify");
const realOnly = process.argv.includes("--real");
const runAll = process.argv.includes("--all");

function printResult(
  label: string,
  result: {
    ok: boolean;
    steps: { name: string; ok: boolean; detail: string }[];
  }
) {
  console.log(`\n${label}`);
  for (const step of result.steps) {
    const tag = step.ok ? "ok" : "FAIL";
    console.log(`[${tag}] ${step.name}: ${step.detail}`);
  }
  return result.ok;
}

try {
  let ok = true;

  if (!realOnly) {
    const stub = await runAgentSmokeAudit({ fullVerify });
    ok = printResult("agent-smoke-audit (lavfi fixture)", stub) && ok;
  }

  if (realOnly || runAll) {
    const real = await runRealFixtureSmokeAudit({ fullVerify });
    if (real) {
      ok =
        printResult(`agent-smoke-audit (real fixture: ${real.slug})`, real) &&
        ok;
    } else {
      console.log(
        "\nagent-smoke-audit (real fixture): skipped (edgaras-raw not present)"
      );
    }
  }

  if (!ok) {
    console.error("\nagent-smoke-audit: failed");
    process.exit(1);
  }
  console.log("\nagent-smoke-audit: passed");
} catch (error) {
  console.error(`\nerror: ${(error as Error).message}\n`);
  process.exit(1);
}
