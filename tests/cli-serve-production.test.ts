// CRAFT-6185: `openklip serve` must launch a production runtime (next start)
// and fail fast with an actionable message rather than silently falling back
// to next dev. cli.ts runs its command switch at module scope (cannot be
// imported in tests, see tests/cli-tasks-history.test.ts), so these spawn the
// CLI as a real subprocess. Both failure paths here exit before ever
// spawning a real Next process, so the tests stay fast and never leak a
// lingering server.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

const CLI = join(import.meta.dir, "../src/cli.ts");

async function runCli(
  args: string[],
  env: Record<string, string | undefined>
): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out: stdout + stderr };
}

test("openklip serve fails with an actionable message when no production build exists", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const appRootDir = join(root, "no-build-app-root");
    const r = await runCli(["serve", slug], {
      OPENKLIP_PROJECTS_ROOT: join(root, "projects"),
      OPENKLIP_APP_ROOT: appRootDir,
    });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /bun run build/);
  });
});

test("openklip serve fails with an actionable message when the port is already in use", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const appRootDir = join(root, "built-app-root");
    await Bun.write(join(appRootDir, ".next", "BUILD_ID"), "fixture-build\n");

    const listener = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response("ok"),
    });
    const port = listener.port;
    try {
      assert.ok(port);
      const r = await runCli(["serve", slug], {
        OPENKLIP_PROJECTS_ROOT: join(root, "projects"),
        OPENKLIP_APP_ROOT: appRootDir,
        PORT: String(port),
        OPENKLIP_HOST: "127.0.0.1",
      });
      assert.notEqual(r.code, 0);
      assert.match(r.out, new RegExp(String(port)));
      assert.match(r.out, /in use/i);
    } finally {
      await listener.stop(true);
    }
  });
});

test("openklip serve reports project-not-found before checking for a production build", async () => {
  await withTempProjectsRoot(async ({ root }) => {
    const r = await runCli(["serve", "nonexistent-project-slug"], {
      OPENKLIP_PROJECTS_ROOT: join(root, "projects"),
      OPENKLIP_APP_ROOT: join(root, "no-build-app-root"),
    });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /project not found/);
  });
});

// An empty workspace must be SERVABLE, not a startup error: the editor
// renders EmptyWorkspace onboarding at "/" (app/lib/editor-home.tsx), and the
// packaged desktop app (src-tauri) launches `serve` with no slug against a
// fresh Application Support state dir on first run — refusing to start here
// left the app stuck on its splash forever. Proven by the guard ORDER: with
// zero projects the CLI must fall through the old "no projects found" throw
// and reach the NEXT preflight (missing production build) instead, which
// exits before any real server spawns, keeping this test fast and leak-free.
test("openklip serve with no slug and an empty workspace proceeds instead of failing with no-projects", async () => {
  await withTempProjectsRoot(async ({ root }) => {
    const r = await runCli(["serve"], {
      OPENKLIP_PROJECTS_ROOT: join(root, "empty-projects"),
      OPENKLIP_APP_ROOT: join(root, "no-build-app-root"),
    });
    assert.notEqual(r.code, 0);
    assert.doesNotMatch(r.out, /no projects found/);
    assert.match(r.out, /bun run build/);
  });
});
