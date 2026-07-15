import assert from "node:assert/strict";
import { test } from "node:test";
import { agentTools } from "../src/agent-tools.ts";
import {
  buildToolsCatalog,
  estimateToolListBytes,
  filterToolsCatalog,
  isMcpCoreTool,
  MCP_CORE_TOOL_NAMES,
  MCP_TOOL_GROUPS,
  parseMcpSurfaceMode,
  planToolsLoad,
  shouldEnableAtConnect,
} from "../src/mcp-tool-surface.ts";

test("parseMcpSurfaceMode defaults to core", () => {
  assert.equal(parseMcpSurfaceMode(undefined), "core");
  assert.equal(parseMcpSurfaceMode(""), "core");
  assert.equal(parseMcpSurfaceMode("core"), "core");
  assert.equal(parseMcpSurfaceMode("all"), "all");
  assert.equal(parseMcpSurfaceMode("FULL"), "all");
});

test("MCP_CORE_TOOL_NAMES is a subset of the mcp agent surface", () => {
  const mcpNames = new Set(agentTools("mcp").map((t) => t.name));
  for (const name of MCP_CORE_TOOL_NAMES) {
    assert.equal(mcpNames.has(name), true, `missing core tool ${name}`);
  }
});

test("shouldEnableAtConnect enables only core in core mode", () => {
  assert.equal(shouldEnableAtConnect("cut", "core"), true);
  assert.equal(shouldEnableAtConnect("broll-add", "core"), false);
  assert.equal(shouldEnableAtConnect("broll-add", "all"), true);
  assert.equal(shouldEnableAtConnect("tools_catalog", "core"), true);
});

test("buildToolsCatalog marks connect-enabled tools", () => {
  const tools = agentTools("mcp").map((t) => ({
    name: t.name,
    summary: t.summary,
  }));
  const catalog = buildToolsCatalog(tools, "core");
  assert.ok(catalog.length >= 90);
  const cut = catalog.find((t) => t.name === "cut");
  const broll = catalog.find((t) => t.name === "broll-add");
  assert.equal(cut?.enabledAtConnect, true);
  assert.equal(broll?.enabledAtConnect, false);
  assert.ok((broll?.groupHints ?? []).includes("overlays"));
});

test("filterToolsCatalog matches name and summary", () => {
  const catalog = buildToolsCatalog(
    [
      { name: "broll-add", summary: "Place b-roll over a span" },
      { name: "cut", summary: "Mark words deleted" },
    ],
    "core"
  );
  assert.equal(filterToolsCatalog(catalog, "broll").length, 1);
  assert.equal(filterToolsCatalog(catalog, "deleted").length, 1);
  assert.equal(filterToolsCatalog(catalog, "overlays").length, 1);
});

test("planToolsLoad resolves names, groups, query, and all", () => {
  const known = agentTools("mcp").map((t) => t.name);

  const byName = planToolsLoad({ names: ["broll-add", "nope"] }, known);
  assert.deepEqual(byName.toEnable, ["broll-add"]);
  assert.deepEqual(byName.unknownNames, ["nope"]);

  const byGroup = planToolsLoad({ group: "cleanup" }, known);
  assert.ok(byGroup.toEnable.includes("cleanup-apply"));
  assert.ok(byGroup.toEnable.includes("dead-air-rm"));

  const badGroup = planToolsLoad({ group: "not-a-group" }, known);
  assert.deepEqual(badGroup.unknownGroups, ["not-a-group"]);
  assert.deepEqual(badGroup.toEnable, []);

  const byQuery = planToolsLoad({ query: "cam_" }, known);
  assert.ok(byQuery.toEnable.some((n) => n.startsWith("cam_")));

  const all = planToolsLoad({ all: true }, known);
  assert.equal(all.toEnable.length, known.length);
});

test("core connect surface is much smaller than full mcp list", () => {
  const mcp = agentTools("mcp");
  const full = mcp.map((t) => ({
    name: t.name,
    summary: t.summary,
    inputSchema: { type: "object" }, // schema presence matters; use placeholder size via real JSON
  }));
  // Prefer real schema sizes when available via manifest-like dump
  const withSchemas = mcp.map((t) => ({
    name: t.name,
    summary: t.summary,
    inputSchema: t.schema
      ? { present: true, keys: Object.keys(t.zodShape) }
      : {},
  }));
  const coreOnly = withSchemas.filter((t) => isMcpCoreTool(t.name));
  const fullBytes = estimateToolListBytes(withSchemas);
  const coreBytes = estimateToolListBytes(coreOnly);
  assert.ok(coreOnly.length === MCP_CORE_TOOL_NAMES.length);
  assert.ok(
    coreBytes < fullBytes * 0.45,
    `expected core (${coreBytes}) < 45% of full (${fullBytes})`
  );
  assert.ok(full.length >= 90);
});

test("every group member exists on the mcp surface", () => {
  const mcpNames = new Set(agentTools("mcp").map((t) => t.name));
  for (const [group, members] of Object.entries(MCP_TOOL_GROUPS)) {
    for (const name of members) {
      assert.equal(
        mcpNames.has(name),
        true,
        `group ${group} references unknown tool ${name}`
      );
    }
  }
});

test("every mcp tool is in core or at least one load group", () => {
  const grouped = new Set(Object.values(MCP_TOOL_GROUPS).flat());
  const orphans = agentTools("mcp")
    .map((t) => t.name)
    .filter((name) => !grouped.has(name));
  assert.deepEqual(orphans, [], `ungrouped mcp tools: ${orphans.join(", ")}`);
});
