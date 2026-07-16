// CRAFT-6176: saveProject must be atomic and crash-safe (tmp + fsync +
// rename, never a truncated project.json). Failure injection mirrors the
// house style in verify-route.test.ts: mock.module("node:fs/promises", ...)
// with a closure `failureMode` toggle, spreading the real module so every
// call except the one under test behaves normally. Converted from node:test
// to bun:test in this pass (mock.module is bun:test-only) so the pre-existing
// coverage below (listProjects/resolveSlug/mutateProject) lives alongside the
// new atomic-write cases in one file.
import { afterEach, expect, mock, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import * as realFsp from "node:fs/promises";
import { join } from "node:path";
import { type Project, ProjectSchema } from "../src/edl.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

type FailureMode = "ok" | "open" | "rename" | "sync";
let failureMode: FailureMode = "ok";

// Snapshot the real functions BEFORE calling mock.module: mock.module
// mutates the live "node:fs/promises" module object in place, so the
// `realFsp` namespace binding itself becomes the mocked version afterward.
// Referencing `realFsp.open` from inside the mock would recurse into itself;
// `original.open` (a plain-object copy taken now) stays the true original.
const original = { ...realFsp };

// Only intercept paths matching our own tmp naming convention
// (project.json.tmp-<pid>-<uuid>). Other callers in the same process (e.g.
// src/project-file-lock.ts opening project.json.lock for mutateProject's
// cross-process lock) must see the real, unmodified fs/promises.
function isOurTmpFile(path: unknown): path is string {
  return typeof path === "string" && path.includes("project.json.tmp-");
}

// Wraps the real fs/promises module: `open` returns a real FileHandle (so
// writeFile/close behave normally) but its `sync` can be forced to throw,
// and `open`/`rename` themselves can be forced to throw, one at a time via
// `failureMode`. Everything else (including opens/renames on other paths)
// passes straight through to the real module.
mock.module("node:fs/promises", () => ({
  ...original,
  open: async (path: string, flags: string, mode?: number) => {
    if (isOurTmpFile(path) && failureMode === "open") {
      throw new Error("injected open failure");
    }
    const fh = await original.open(path, flags, mode);
    if (!isOurTmpFile(path)) {
      return fh;
    }
    return {
      close: () => fh.close(),
      sync: async () => {
        if (failureMode === "sync") {
          throw new Error("injected fsync failure");
        }
        return await fh.sync();
      },
      writeFile: (data: string) => fh.writeFile(data),
    };
  },
  rename: async (src: string, dest: string) => {
    if (isOurTmpFile(src) && failureMode === "rename") {
      throw new Error("injected rename failure");
    }
    return await original.rename(src, dest);
  },
}));

const { listProjects, loadProject, mutateProject, resolveSlug, saveProject } =
  await import("../src/projectStore.ts");

afterEach(() => {
  failureMode = "ok";
  mock.restore();
});

function tmpLeftovers(dir: string): string[] {
  return readdirSync(dir).filter((name) =>
    name.startsWith("project.json.tmp-")
  );
}

// ── pre-existing coverage (translated from node:test to bun:test) ──────────

test("listProjects returns slugs sorted by mtime descending", async () => {
  await withTempProjectsRoot(({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const listed = listProjects();
    expect(listed.length).toBe(1);
    expect(listed[0]?.slug).toBe(slug);
  });
});

test("loadProject and saveProject round-trip project.json", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({ slug });
    writeFixtureProject(slug, project);
    project.words[0].deleted = true;
    await saveProject(slug, project);
    const loaded = await loadProject(slug);
    expect(loaded.words[0].deleted).toBe(true);
  });
});

test("resolveSlug prefers explicit slug param", async () => {
  await withTempProjectsRoot(({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    expect(resolveSlug(slug)).toBe(slug);
  });
});

test("resolveSlug throws when no projects exist", async () => {
  await withTempProjectsRoot(() => {
    expect(() => resolveSlug(null)).toThrow(/no projects found/);
  });
});

test("resolveSlug throws for missing project slug", async () => {
  await withTempProjectsRoot(() => {
    expect(() => resolveSlug("missing")).toThrow(/project not found/);
  });
});

test("loadProject throws for missing slug", async () => {
  await withTempProjectsRoot(async () => {
    await expect(loadProject("missing")).rejects.toThrow(/project not found/);
  });
});

test("saveProject writes pretty JSON to disk", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    const project = makeProject({ slug });
    writeFixtureProject(slug, project);
    await saveProject(slug, project);
    const raw = readFileSync(
      join(root, "projects", slug, "project.json"),
      "utf8"
    );
    expect(raw).toMatch(/{\n {2}"version": 1/);
  });
});

test("saveProject rejects when the project directory is missing", async () => {
  await withTempProjectsRoot(async () => {
    await expect(
      saveProject("missing", makeProject({ slug: "missing" }))
    ).rejects.toThrow(/project\.json/);
  });
});

test("mutateProject serializes concurrent edits (no lost update)", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    const project = makeProject({ slug });
    project.padMs = 0;
    writeFixtureProject(slug, project);

    const delay = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    // Each call reads padMs, pauses (to widen the race window), then writes
    // padMs+1. Without per-slug serialization both read 0 and both save 1:
    // a lost update. With the lock they chain: 0 -> 1 -> 2.
    await Promise.all([
      mutateProject(slug, async (p) => {
        const v = p.padMs;
        await delay(5);
        p.padMs = v + 1;
      }),
      mutateProject(slug, async (p) => {
        const v = p.padMs;
        await delay(5);
        p.padMs = v + 1;
      }),
    ]);

    const reloaded = await loadProject(slug);
    expect(reloaded.padMs).toBe(2);
  });
});

// ── CRAFT-6176: atomic tmp+rename write, fsync durability ──────────────────

test("happy path: pretty-printed JSON, round-trips through ProjectSchema, no tmp leftovers", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    const project = makeProject({ slug });
    writeFixtureProject(slug, project);
    const dir = join(root, "projects", slug);
    const target = join(dir, "project.json");

    await saveProject(slug, project);

    const raw = readFileSync(target, "utf8");
    expect(raw).toContain("\n");
    expect(raw).toContain("  ");
    const parsed = ProjectSchema.parse(JSON.parse(raw));
    expect(parsed.slug).toBe(slug);
    expect(tmpLeftovers(dir)).toEqual([]);
  });
});

test("temp-write (open) failure: rejects, original untouched, no tmp leftover", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    const original = makeProject({ slug });
    writeFixtureProject(slug, original);
    const dir = join(root, "projects", slug);
    const target = join(dir, "project.json");
    const before = readFileSync(target, "utf8");

    failureMode = "open";
    await expect(
      saveProject(slug, makeProject({ slug, padMs: 999 }))
    ).rejects.toThrow(/injected open failure/);

    const after = readFileSync(target, "utf8");
    expect(after).toBe(before);
    expect(ProjectSchema.parse(JSON.parse(after)).padMs).toBe(original.padMs);
    expect(tmpLeftovers(dir)).toEqual([]);
  });
});

test("fsync failure: rejects, original untouched, no tmp leftover", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    const original = makeProject({ slug });
    writeFixtureProject(slug, original);
    const dir = join(root, "projects", slug);
    const target = join(dir, "project.json");
    const before = readFileSync(target, "utf8");

    failureMode = "sync";
    await expect(
      saveProject(slug, makeProject({ slug, padMs: 999 }))
    ).rejects.toThrow(/injected fsync failure/);

    const after = readFileSync(target, "utf8");
    expect(after).toBe(before);
    expect(ProjectSchema.parse(JSON.parse(after)).padMs).toBe(original.padMs);
    expect(tmpLeftovers(dir)).toEqual([]);
  });
});

test("rename failure: rejects, original untouched, no tmp leftover", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    const original = makeProject({ slug });
    writeFixtureProject(slug, original);
    const dir = join(root, "projects", slug);
    const target = join(dir, "project.json");
    const before = readFileSync(target, "utf8");

    failureMode = "rename";
    await expect(
      saveProject(slug, makeProject({ slug, padMs: 999 }))
    ).rejects.toThrow(/injected rename failure/);

    const after = readFileSync(target, "utf8");
    expect(after).toBe(before);
    expect(ProjectSchema.parse(JSON.parse(after)).padMs).toBe(original.padMs);
    expect(tmpLeftovers(dir)).toEqual([]);
  });
});

test("invalid project is rejected before any write, leaving the existing file untouched", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    const original = makeProject({ slug });
    writeFixtureProject(slug, original);
    const dir = join(root, "projects", slug);
    const target = join(dir, "project.json");
    const before = readFileSync(target, "utf8");

    const bad = { ...original } as Partial<Project>;
    bad.source = undefined;

    await expect(
      saveProject(slug, bad as unknown as Project)
    ).rejects.toThrow();

    const after = readFileSync(target, "utf8");
    expect(after).toBe(before);
    expect(ProjectSchema.parse(JSON.parse(after)).slug).toBe(slug);
    expect(tmpLeftovers(dir)).toEqual([]);
  });
});
