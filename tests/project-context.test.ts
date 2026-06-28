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
});
