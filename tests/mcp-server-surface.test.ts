import assert from "node:assert/strict";
import { test } from "node:test";
import { agentTools } from "../src/agent-tools.ts";
import { createOpenKlipMcpServer } from "../src/mcp-server.ts";
import {
  estimateToolListBytes,
  isMcpCoreTool,
  MCP_CORE_TOOL_NAMES,
  MCP_META_TOOL_NAMES,
} from "../src/mcp-tool-surface.ts";

test("createOpenKlipMcpServer core mode enables core + meta only", () => {
  const { registered, mode } = createOpenKlipMcpServer({ surfaceMode: "core" });
  assert.equal(mode, "core");

  for (const name of MCP_META_TOOL_NAMES) {
    assert.equal(registered.get(name)?.enabled, true, name);
  }
  for (const name of MCP_CORE_TOOL_NAMES) {
    assert.equal(registered.get(name)?.enabled, true, `core ${name}`);
  }

  const deferred = agentTools("mcp").filter((t) => !isMcpCoreTool(t.name));
  assert.ok(deferred.length > 40);
  for (const t of deferred.slice(0, 15)) {
    assert.equal(
      registered.get(t.name)?.enabled,
      false,
      `expected deferred ${t.name}`
    );
  }

  const enabledCount = [...registered.values()].filter((t) => t.enabled).length;
  // core tools + 3 meta
  assert.equal(
    enabledCount,
    MCP_CORE_TOOL_NAMES.length + MCP_META_TOOL_NAMES.length
  );
});

test("createOpenKlipMcpServer all mode enables every agent tool", () => {
  const { registered, mode } = createOpenKlipMcpServer({ surfaceMode: "all" });
  assert.equal(mode, "all");
  for (const t of agentTools("mcp")) {
    assert.equal(registered.get(t.name)?.enabled, true, t.name);
  }
  for (const name of MCP_META_TOOL_NAMES) {
    assert.equal(registered.get(name)?.enabled, true, name);
  }
});

test("core enabled tool list is far smaller than full agent tool list", () => {
  const mcp = agentTools("mcp");
  const fullEstimate = estimateToolListBytes(
    mcp.map((t) => ({
      name: t.name,
      summary: t.summary,
      inputSchema: Object.fromEntries(
        Object.keys(t.zodShape).map((k) => [k, { type: "unknown" }])
      ),
    }))
  );
  const coreEstimate = estimateToolListBytes(
    mcp
      .filter((t) => isMcpCoreTool(t.name))
      .map((t) => ({
        name: t.name,
        summary: t.summary,
        inputSchema: Object.fromEntries(
          Object.keys(t.zodShape).map((k) => [k, { type: "unknown" }])
        ),
      }))
  );
  // Meta tools add a little, but connect surface should still be under half.
  assert.ok(
    coreEstimate < fullEstimate * 0.5,
    `core ${coreEstimate} vs full ${fullEstimate}`
  );
});
