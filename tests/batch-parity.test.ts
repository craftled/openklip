import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentToolNames,
  callAgentTool,
} from "../src/agent-tools.ts";
import { runDoctor } from "../src/doctor.ts";
import { parseExportLoudnessFlag } from "../src/exporter.ts";
import { IngestPersistError } from "../src/ingest-persist-error.ts";
import { POST } from "../app/api/workspace/route.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("agentToolNames includes new MCP parity tools", () => {
  const names = agentToolNames("mcp");
  for (const tool of [
    "doctor",
    "highlights_detect",
    "export_highlight",
    "take_add",
  ]) {
    assert.ok(names.includes(tool), `missing MCP tool ${tool}`);
  }
});

test("callAgentTool doctor returns a report", async () => {
  const report = (await callAgentTool("doctor", {})) as { ok: boolean };
  assert.equal(typeof report.ok, "boolean");
  assert.equal(report.ok, (await runDoctor()).ok);
});

test("parseExportLoudnessFlag accepts off", () => {
  assert.equal(parseExportLoudnessFlag("off"), "off");
  assert.equal(parseExportLoudnessFlag("-14"), -14);
});

test("IngestPersistError carries the created slug", () => {
  const error = new IngestPersistError("demo", new Error("disk full"));
  assert.equal(error.slug, "demo");
  assert.match(error.message, /demo/);
});

test("POST /api/workspace set stores a custom projects root", async () => {
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  const prevCwd = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), "openklip-workspace-set-"));
  const chosen = join(temp, "custom-root");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(chosen, { recursive: true });
  process.chdir(temp);
  delete process.env.OPENKLIP_PROJECTS_ROOT;
  try {
    const res = await POST(
      new Request("http://localhost/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", path: chosen }),
      })
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as { root?: string };
    assert.equal(json.root, chosen);
  } finally {
    process.chdir(prevCwd);
    if (prevRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
    }
    rmSync(temp, { recursive: true, force: true });
  }
});