import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { GET, POST } from "../app/api/projects/[slug]/assets/route.ts";
import { POST as SYNC_POST } from "../app/api/projects/[slug]/assets/sync/route.ts";
import { FFMPEG } from "../src/ffmpeg.ts";
import { brollClipFor, orphanBrollAsset, TINY_PNG } from "./helpers/assetFixture.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function postAsset(slug: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const req = new Request(`http://localhost/api/projects/${slug}/assets`, {
    method: "POST",
    body: form,
  });
  return POST(req as Parameters<typeof POST>[0], ctx(slug));
}

test("POST /api/projects/:slug/assets registers music and returns JSON", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));

    const proc = Bun.spawn(
      [
        FFMPEG,
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        "-q:a",
        "9",
        "/tmp/openklip-test-track.mp3",
      ],
      { stdout: "ignore", stderr: "pipe" }
    );
    assert.equal(await proc.exited, 0);

    const bytes = readFileSync("/tmp/openklip-test-track.mp3");
    const res = await postAsset(
      slug,
      new File([bytes], "track.mp3", { type: "audio/mpeg" })
    );
    const data = (await res.json()) as {
      asset?: { kind: string; id: string };
      assets?: unknown[];
      error?: string;
    };

    assert.equal(res.status, 200);
    assert.equal(data.asset?.kind, "music");
    assert.ok(Array.isArray(data.assets) && data.assets.length === 1);
  });
});

test("POST /api/projects/:slug/assets returns JSON error for missing file", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const form = new FormData();
    const req = new Request(`http://localhost/api/projects/${slug}/assets`, {
      method: "POST",
      body: form,
    });
    const res = await POST(req as Parameters<typeof POST>[0], ctx(slug));
    assert.equal(res.status, 400);
    const data = (await res.json()) as { error?: string };
    assert.match(data.error ?? "", /missing file/i);
  });
});

test("GET /api/projects/:slug/assets is pure: does not register dropped files", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const assetsDir = join(root, "projects", slug, "assets");
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, "incoming.png"), TINY_PNG);

    const res = await GET(
      new Request(`http://localhost/api/projects/${slug}/assets`) as Parameters<
        typeof GET
      >[0],
      ctx(slug)
    );
    const data = (await res.json()) as { assets?: unknown[] };
    assert.equal(res.status, 200);
    // The dropped PNG must NOT be registered by a GET.
    assert.equal(data.assets?.length, 0);
  });
});

test("POST /api/projects/:slug/assets/sync registers new drops and returns them", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const assetsDir = join(root, "projects", slug, "assets");
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, "incoming.png"), TINY_PNG);

    const res = await SYNC_POST(
      new Request(`http://localhost/api/projects/${slug}/assets/sync`, {
        method: "POST",
      }) as Parameters<typeof SYNC_POST>[0],
      ctx(slug)
    );
    const data = (await res.json()) as {
      assets?: { kind: string; src: string }[];
    };
    assert.equal(res.status, 200);
    assert.equal(data.assets?.length, 1);
    assert.equal(data.assets?.[0]?.kind, "still");
  });
});

test("POST /api/projects/:slug/assets/sync prunes orphan registrations outside assets/", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(
      slug,
      makeProject({
        slug,
        assets: [orphanBrollAsset()],
        broll: [brollClipFor("orphan")],
      })
    );
    const assetsDir = join(root, "projects", slug, "assets");
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, "incoming.png"), TINY_PNG);

    const res = await SYNC_POST(
      new Request(`http://localhost/api/projects/${slug}/assets/sync`, {
        method: "POST",
      }) as Parameters<typeof SYNC_POST>[0],
      ctx(slug)
    );
    const data = (await res.json()) as {
      assets?: { name: string }[];
      broll?: unknown[];
      byKind?: { broll: unknown[] };
    };
    assert.equal(res.status, 200);
    assert.equal(data.assets?.length, 1);
    assert.equal(data.assets?.[0]?.name, "incoming.png");
    assert.equal(data.broll?.length, 0);
    assert.equal(data.byKind?.broll.length, 0);
  });
});
