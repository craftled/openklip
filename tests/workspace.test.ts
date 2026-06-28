import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GET, POST } from "../app/api/workspace/route.ts";
import { projectsRoot } from "../src/paths.ts";
import {
  isWorkspaceConfigured,
  readConfiguredProjectsRoot,
  writeConfiguredProjectsRoot,
} from "../src/workspace-config.ts";

test("writeConfiguredProjectsRoot persists and projectsRoot reads it", () => {
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  const prevCwd = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), "openklip-workspace-"));
  const chosen = join(temp, "my-projects");
  mkdirSync(chosen, { recursive: true });
  process.chdir(temp);
  delete process.env.OPENKLIP_PROJECTS_ROOT;
  try {
    assert.equal(readConfiguredProjectsRoot(), null);
    writeConfiguredProjectsRoot(chosen);
    assert.equal(readConfiguredProjectsRoot(), chosen);
    assert.equal(projectsRoot(), chosen);
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

test("isWorkspaceConfigured is false before folder pick", () => {
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  delete process.env.OPENKLIP_PROJECTS_ROOT;
  try {
    assert.equal(
      isWorkspaceConfigured(),
      readConfiguredProjectsRoot() !== null
    );
  } finally {
    if (prevRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
    }
  }
});

test("GET /api/workspace returns the active projects root", async () => {
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  process.env.OPENKLIP_PROJECTS_ROOT = "/tmp/openklip-workspace-root";
  try {
    const res = GET();
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      configured?: boolean;
      root?: string;
    };
    assert.equal(json.root, "/tmp/openklip-workspace-root");
    assert.equal(json.configured, true);
  } finally {
    if (prevRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
    }
  }
});

test("POST /api/workspace pick stores the chosen folder", async () => {
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  const prevPick = process.env.OPENKLIP_TEST_PICK;
  const prevPickPath = process.env.OPENKLIP_TEST_PICK_PATH;
  const prevCwd = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), "openklip-workspace-api-"));
  const chosen = join(temp, "picked");
  mkdirSync(chosen, { recursive: true });
  process.chdir(temp);
  delete process.env.OPENKLIP_PROJECTS_ROOT;
  process.env.OPENKLIP_TEST_PICK = "1";
  process.env.OPENKLIP_TEST_PICK_PATH = chosen;
  try {
    const res = await POST(
      new Request("http://localhost/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pick" }),
      })
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as { root?: string; projects?: unknown[] };
    assert.equal(json.root, chosen);
    assert.deepEqual(json.projects, []);
    assert.equal(projectsRoot(), chosen);
  } finally {
    process.chdir(prevCwd);
    if (prevRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
    }
    if (prevPick === undefined) {
      delete process.env.OPENKLIP_TEST_PICK;
    } else {
      process.env.OPENKLIP_TEST_PICK = prevPick;
    }
    if (prevPickPath === undefined) {
      delete process.env.OPENKLIP_TEST_PICK_PATH;
    } else {
      process.env.OPENKLIP_TEST_PICK_PATH = prevPickPath;
    }
    rmSync(temp, { recursive: true, force: true });
  }
});

test("POST /api/workspace pick returns cancelled without writing", async () => {
  const prevPick = process.env.OPENKLIP_TEST_PICK;
  const prevPickPath = process.env.OPENKLIP_TEST_PICK_PATH;
  process.env.OPENKLIP_TEST_PICK = "1";
  delete process.env.OPENKLIP_TEST_PICK_PATH;
  try {
    const res = await POST(
      new Request("http://localhost/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pick" }),
      })
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as { cancelled?: boolean };
    assert.equal(json.cancelled, true);
  } finally {
    if (prevPick === undefined) {
      delete process.env.OPENKLIP_TEST_PICK;
    } else {
      process.env.OPENKLIP_TEST_PICK = prevPick;
    }
    if (prevPickPath === undefined) {
      delete process.env.OPENKLIP_TEST_PICK_PATH;
    } else {
      process.env.OPENKLIP_TEST_PICK_PATH = prevPickPath;
    }
  }
});
