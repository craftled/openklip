import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectPaths } from "@engine/paths";
import { GET } from "../app/api/projects/[slug]/frames/route.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

interface FramesResponse {
  frames: Array<{
    name: string;
    atSec: number;
    url: string;
  }>;
}

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("/api/projects/:slug/frames", () => {
  test("returns ingest frame samples from working/frames", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));
      const framesDir = projectPaths(slug).frames;
      mkdirSync(framesDir, { recursive: true });
      writeFileSync(join(framesDir, "0002.jpg"), "frame-2");
      writeFileSync(join(framesDir, "0001.jpg"), "frame-1");
      writeFileSync(join(framesDir, "0003.jpg"), "frame-3");

      const res = await GET(
        new Request(
          `http://localhost/api/projects/${slug}/frames`
        ) as Parameters<typeof GET>[0],
        ctx(slug)
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as FramesResponse;
      expect(body.frames).toEqual([
        {
          name: "0001.jpg",
          atSec: 0,
          url: `/media/frames/0001.jpg?slug=${slug}`,
        },
        {
          name: "0002.jpg",
          atSec: 3,
          url: `/media/frames/0002.jpg?slug=${slug}`,
        },
        {
          name: "0003.jpg",
          atSec: 6,
          url: `/media/frames/0003.jpg?slug=${slug}`,
        },
      ]);
    });
  });

  test("supports a positive integer limit query", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));
      const framesDir = projectPaths(slug).frames;
      mkdirSync(framesDir, { recursive: true });
      writeFileSync(join(framesDir, "0001.jpg"), "1");
      writeFileSync(join(framesDir, "0002.jpg"), "2");
      writeFileSync(join(framesDir, "0003.jpg"), "3");
      writeFileSync(join(framesDir, "0004.jpg"), "4");

      const res = await GET(
        new Request(
          `http://localhost/api/projects/${slug}/frames?limit=2`
        ) as Parameters<typeof GET>[0],
        ctx(slug)
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as FramesResponse;
      expect(body.frames).toHaveLength(2);
      expect(body.frames.map((frame) => frame.name)).toEqual([
        "0001.jpg",
        "0003.jpg",
      ]);
    });
  });

  test("returns 400 for invalid limit query", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));
      const framesDir = projectPaths(slug).frames;
      mkdirSync(framesDir, { recursive: true });
      writeFileSync(join(framesDir, "0001.jpg"), "1");

      const res = await GET(
        new Request(
          `http://localhost/api/projects/${slug}/frames?limit=0`
        ) as Parameters<typeof GET>[0],
        ctx(slug)
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe("limit must be a positive integer when provided");
    });
  });

  test("returns 400 for invalid slug", async () => {
    await withTempProjectsRoot(async () => {
      const res = await GET(
        new Request(
          "http://localhost/api/projects/../etc/frames"
        ) as Parameters<typeof GET>[0],
        ctx("../etc")
      );
      expect(res.status).toBe(400);
    });
  });

  test("returns 404 for a missing project", async () => {
    await withTempProjectsRoot(async () => {
      const res = await GET(
        new Request(
          "http://localhost/api/projects/missing/frames"
        ) as Parameters<typeof GET>[0],
        ctx("missing")
      );
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe("project not found: missing");
    });
  });

  test("returns an empty array when frames are unavailable", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));

      const res = await GET(
        new Request(
          `http://localhost/api/projects/${slug}/frames`
        ) as Parameters<typeof GET>[0],
        ctx(slug)
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as FramesResponse;
      expect(body.frames).toEqual([]);
    });
  });
});
