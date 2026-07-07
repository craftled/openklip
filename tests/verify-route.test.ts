import { afterEach, describe, expect, mock, test } from "bun:test";
import * as realVerify from "../src/verify.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

interface VerifyResponse {
  dashboard?: {
    ok: boolean;
    warnings: string[];
  };
  error?: string;
  ok?: boolean;
  report?: {
    fillerSurvivors: string[];
    keptCoverage: number;
    leakedDeleted: string[];
    missingKept: string[];
    ok: boolean;
    renderedWordCount: number;
  };
  verdict?: string;
}

let mode: "ok" | "no-export" | "broken" = "ok";

mock.module("@engine/verify", () => ({
  ...realVerify,
  verifyCut: () => {
    if (mode === "no-export") {
      throw new Error("no export found. Run: openklip export fixture");
    }
    if (mode === "broken") {
      throw new Error("ffmpeg failed unexpectedly");
    }
    return {
      fillerSurvivors: [],
      keptCoverage: 1,
      leakedDeleted: [],
      missingKept: [],
      ok: true,
      renderedWordCount: 9,
    };
  },
}));

function loadRoute() {
  return import("../app/api/projects/[slug]/verify/route.ts");
}

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

afterEach(() => {
  mock.restore();
});

describe("/api/projects/:slug/verify", () => {
  test("returns verdict for a valid project", async () => {
    mode = "ok";
    const { GET } = await loadRoute();
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));

      const res = await GET(
        new Request(
          `http://localhost/api/projects/${slug}/verify`
        ) as Parameters<typeof GET>[0],
        ctx(slug)
      );

      const body = (await res.json()) as VerifyResponse;
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.report).toEqual({
        fillerSurvivors: [],
        keptCoverage: 1,
        leakedDeleted: [],
        missingKept: [],
        ok: true,
        renderedWordCount: 9,
      });
      expect(body.dashboard).toMatchObject({
        ok: true,
        warnings: [],
      });
      expect(body.verdict).toBe(
        "verified: zero filler, no leaked cuts, 100% kept-word coverage"
      );
    });
  });

  test("returns 400 when export is missing", async () => {
    mode = "no-export";
    const { GET } = await loadRoute();
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));

      const res = await GET(
        new Request(
          `http://localhost/api/projects/${slug}/verify`
        ) as Parameters<typeof GET>[0],
        ctx(slug)
      );
      const body = (await res.json()) as VerifyResponse;
      expect(res.status).toBe(400);
      expect(body.error).toBe("no export found. Run: openklip export fixture");
    });
  });

  test("returns 500 when verify fails unexpectedly", async () => {
    mode = "broken";
    const { GET } = await loadRoute();
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));

      const res = await GET(
        new Request(
          `http://localhost/api/projects/${slug}/verify`
        ) as Parameters<typeof GET>[0],
        ctx(slug)
      );
      const body = (await res.json()) as VerifyResponse;
      expect(res.status).toBe(500);
      expect(body.error).toBe("ffmpeg failed unexpectedly");
    });
  });

  test("returns 400 for invalid slug", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      new Request("http://localhost/api/projects/../etc/verify") as Parameters<
        typeof GET
      >[0],
      ctx("../etc")
    );
    const body = (await res.json()) as VerifyResponse;
    expect(res.status).toBe(400);
    expect(body.error).toContain("invalid project slug");
  });

  test("returns 404 for a missing project", async () => {
    const { GET } = await loadRoute();
    await withTempProjectsRoot(async () => {
      const res = await GET(
        new Request(
          "http://localhost/api/projects/missing/verify"
        ) as Parameters<typeof GET>[0],
        ctx("missing")
      );
      const body = (await res.json()) as VerifyResponse;
      expect(res.status).toBe(404);
      expect(body.error).toBe("project not found: missing");
    });
  });
});
