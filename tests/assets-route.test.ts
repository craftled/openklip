import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { POST } from "../app/api/projects/[slug]/assets/route.ts";
import { FFMPEG } from "../src/ffmpeg.ts";
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
