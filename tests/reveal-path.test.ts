import assert from "node:assert/strict";
import { platform } from "node:os";
import { test } from "node:test";
import { revealCommand } from "../src/reveal-path.ts";

test("revealCommand uses open on macOS", () => {
  if (platform() !== "darwin") {
    return;
  }
  const cmd = revealCommand("/tmp/demo");
  assert.equal(cmd.command, "/usr/bin/open");
  assert.deepEqual(cmd.args, ["/tmp/demo"]);
});

test("revealCommand uses explorer on Windows", () => {
  if (platform() !== "win32") {
    return;
  }
  const cmd = revealCommand("C:\\demo");
  assert.equal(cmd.command, "explorer");
  assert.deepEqual(cmd.args, ["C:\\demo"]);
});

test("revealCommand uses xdg-open elsewhere", () => {
  const os = platform();
  if (os === "darwin" || os === "win32") {
    return;
  }
  const cmd = revealCommand("/tmp/demo");
  assert.equal(cmd.command, "xdg-open");
  assert.deepEqual(cmd.args, ["/tmp/demo"]);
});
