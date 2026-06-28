import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Project } from "../../src/edl.ts";
import { SAMPLE_RATE } from "../../src/edl.ts";
import { projectsRoot } from "../../src/paths.ts";

export function makeProject(overrides: Partial<Project> = {}): Project {
  const sec = (n: number) => n * SAMPLE_RATE;
  return {
    version: 1,
    slug: "test-fixture",
    source: "/tmp/source.mp4",
    proxy: "working/proxy.mp4",
    sampleRate: SAMPLE_RATE,
    fps: 30,
    width: 1280,
    height: 720,
    durationSamples: sec(10),
    padMs: 50,
    captions: { enabled: true, maxWords: 6 },
    assets: [
      {
        id: "broll-a",
        kind: "broll",
        name: "b-roll.mp4",
        src: "/tmp/b-roll.mp4",
        proxy: "working/assets/broll-a.mp4",
        durationSamples: sec(30),
      },
    ],
    broll: [],
    look: { vignette: false },
    zooms: [],
    titles: [],
    words: [
      {
        id: "w0",
        text: "Hello",
        startSample: 0,
        endSample: sec(1),
        deleted: false,
      },
      {
        id: "w1",
        text: "world",
        startSample: sec(1),
        endSample: sec(2),
        deleted: false,
      },
    ],
    ...overrides,
  };
}

export async function withTempProjectsRoot<T>(
  fn: (ctx: { slug: string; root: string }) => T | Promise<T>
): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "openklip-projects-"));
  const slug = "fixture";
  const dir = join(root, "projects", slug);
  mkdirSync(dir, { recursive: true });
  // Pin projectsRoot() to this temp tree explicitly so project path
  // resolution doesn't depend on process.cwd() — Bun runs test files in
  // parallel and a global chdir would race across files. Restore after.
  const prevRoot = process.env.OPENKLIP_PROJECTS_ROOT;
  const prevSlug = process.env.OPENKLIP_SLUG;
  process.env.OPENKLIP_PROJECTS_ROOT = join(root, "projects");
  delete process.env.OPENKLIP_SLUG;
  try {
    return await fn({ slug, root });
  } finally {
    if (prevRoot === undefined) {
      delete process.env.OPENKLIP_PROJECTS_ROOT;
    } else {
      process.env.OPENKLIP_PROJECTS_ROOT = prevRoot;
    }
    if (prevSlug === undefined) {
      delete process.env.OPENKLIP_SLUG;
    } else {
      process.env.OPENKLIP_SLUG = prevSlug;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

export function writeFixtureProject(slug: string, project: Project): void {
  const dir = join(projectsRoot(), slug);
  mkdirSync(join(dir, "working"), { recursive: true });
  mkdirSync(join(dir, "assets"), { recursive: true });
  mkdirSync(join(dir, "output"), { recursive: true });
  writeFileSync(join(dir, "project.json"), JSON.stringify(project, null, 2));
  writeFileSync(join(dir, "working", "proxy.mp4"), "fake-proxy-bytes");
}
