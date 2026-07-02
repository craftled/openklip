import { describe, expect, test } from "bun:test";
import {
  basenamePath,
  buildProjectHoverContext,
  formatDurationSec,
} from "../web/lib/project-context.ts";
import { makeProject } from "./helpers/projectFixture.ts";

describe("formatDurationSec", () => {
  test("formats minutes and zero-padded seconds", () => {
    expect(formatDurationSec(272)).toBe("4:32");
    expect(formatDurationSec(65)).toBe("1:05");
  });
});

describe("basenamePath", () => {
  test("returns the last path segment", () => {
    expect(basenamePath("input/source.mp4")).toBe("source.mp4");
    expect(basenamePath("/Users/me/video.mov")).toBe("video.mov");
  });
});

describe("buildProjectHoverContext", () => {
  test("includes slug, source, dir path, and summary", () => {
    const project = makeProject({ slug: "demo", source: "input/source.mp4" });
    const ctx = buildProjectHoverContext(
      project,
      "~/Sites/openklip/projects/demo"
    );
    expect(ctx.slug).toBe("demo");
    expect(ctx.source).toBe("input/source.mp4");
    expect(ctx.dirPath).toBe("~/Sites/openklip/projects/demo");
    expect(ctx.summary.words).toBeGreaterThan(0);
  });

  // C3: the hover card's numbers must agree with the editor's own
  // effectiveRanges call, which threads silences into the snap pass.
  test("threads silences into summarize so hover numbers reflect snap", () => {
    const project = makeProject({
      slug: "demo",
      padMs: 0,
      cuts: {
        snap: { enabled: true, mode: "vad", maxShiftMs: 120, crossfadeMs: 24 },
        deadAir: [],
      },
    });
    // Fixture words span 0-2s; a silence starting at 1.9s pulls the range
    // end back by 100ms when snap is on and silences are supplied.
    const without = buildProjectHoverContext(project, "/tmp/demo");
    const withSilences = buildProjectHoverContext(
      { ...project, silences: [{ startSec: 1.9, endSec: 2.2 }] },
      "/tmp/demo"
    );
    expect(without.summary.keptDurationSec).toBeCloseTo(2, 5);
    expect(withSilences.summary.keptDurationSec).toBeCloseTo(1.9, 5);
  });
});
