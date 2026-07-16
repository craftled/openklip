import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * RED-phase tests: Verify that large JSON outputs from the CLI
 * can be piped without truncation at the 65KB OS buffer boundary.
 * These tests spawn the real CLI as subprocesses and pipe stdout.
 */

test("tools --json pipes intact (exceeds 64KB buffer)", async () => {
  const proc = Bun.spawn(
    ["bun", "run", "src/cli.ts", "tools", "--json", "--surface", "mcp"],
    {
      stdout: "pipe",
      cwd: process.cwd(),
    }
  );

  const stdoutText = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  assert.equal(exitCode, 0, "CLI should exit successfully");

  // Verify the output is valid JSON
  let toolsArray: unknown;
  try {
    toolsArray = JSON.parse(stdoutText);
  } catch (e) {
    assert.fail(
      "tools --json output is not valid JSON. " +
        `Byte length: ${stdoutText.length}. ` +
        `Last 200 chars: "${stdoutText.slice(-200)}". ` +
        `Error: ${e}`
    );
  }

  // Verify it's an array
  assert.ok(Array.isArray(toolsArray), "tools output should be an array");

  // Verify the output exceeds the 64KB pipe buffer (so this test exercises the fix)
  assert.ok(
    stdoutText.length > 65_536,
    `tools --json output should exceed 65KB buffer (got ${stdoutText.length} bytes)`
  );

  // Verify we got all tools (this would be truncated if piped incorrectly)
  assert.equal(
    toolsArray.length,
    98,
    `tools array should have 98 entries (got ${toolsArray.length})`
  );

  // Verify the last tool entry is present and well-formed (proves nothing was truncated)
  const lastTool = toolsArray[toolsArray.length - 1] as Record<string, unknown>;
  assert.ok(lastTool.name, "last tool should have a name");
  assert.ok(lastTool.summary, "last tool should have a summary");
});

test("actions --json pipes intact and parses", async () => {
  const proc = Bun.spawn(["bun", "run", "src/cli.ts", "actions", "--json"], {
    stdout: "pipe",
    cwd: process.cwd(),
  });

  const stdoutText = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  assert.equal(exitCode, 0, "CLI should exit successfully");

  let actionsArray: unknown;
  try {
    actionsArray = JSON.parse(stdoutText);
  } catch (e) {
    assert.fail(`actions --json output is not valid JSON: ${e}`);
  }

  assert.ok(Array.isArray(actionsArray), "actions output should be an array");
  assert.equal(
    actionsArray.length,
    46,
    `actions array should have 46 entries (got ${actionsArray.length})`
  );
});

test("features --json pipes intact and parses", async () => {
  const proc = Bun.spawn(["bun", "run", "src/cli.ts", "features", "--json"], {
    stdout: "pipe",
    cwd: process.cwd(),
  });

  const stdoutText = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  assert.equal(exitCode, 0, "CLI should exit successfully");

  let featuresObj: unknown;
  try {
    featuresObj = JSON.parse(stdoutText);
  } catch (e) {
    assert.fail(`features --json output is not valid JSON: ${e}`);
  }

  assert.ok(
    featuresObj &&
      typeof featuresObj === "object" &&
      !Array.isArray(featuresObj),
    "features output should be an object"
  );
  const obj = featuresObj as Record<string, unknown>;
  assert.ok(
    Array.isArray(obj.groups),
    "features object should have a groups array"
  );
  assert.ok(
    Array.isArray(obj.features),
    "features object should have a features array"
  );
});

test("tools --json through intermediate parser (like jq)", async () => {
  // This test spawns two processes: the CLI writing to a parser
  // This mimics: openklip tools --json | jq length
  const proc = Bun.spawn(
    ["bun", "run", "src/cli.ts", "tools", "--json", "--surface", "mcp"],
    {
      stdout: "pipe",
      cwd: process.cwd(),
    }
  );

  const stdoutText = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  assert.equal(exitCode, 0, "CLI should exit successfully");

  // Parse as intermediate consumer would
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdoutText);
  } catch (e) {
    assert.fail(
      "tools --json is truncated or malformed JSON. " +
        `Received ${stdoutText.length} bytes. ` +
        `Error: ${e}`
    );
  }

  assert.ok(Array.isArray(parsed), "result should be an array");
  assert.equal((parsed as unknown[]).length, 98, "should have 98 items");
});
