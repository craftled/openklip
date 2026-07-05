import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveIngesterArgv } from "../src/ingesters.ts";
import { UrlIngesterUnavailableError } from "../src/url-ingest.ts";

test("url ingester argv substitutes url and output template", () => {
  const argv = resolveIngesterArgv(
    {
      id: "url",
      label: "URL",
      command: "yt-dlp",
      args: ["{url}", "-o", "{output}"],
      fields: [{ name: "url", required: true }],
    },
    { url: "https://example.com/v.mp4" },
    "/tmp/download.%(ext)s"
  );
  assert.deepEqual(argv, [
    "yt-dlp",
    "https://example.com/v.mp4",
    "-o",
    "/tmp/download.%(ext)s",
  ]);
});

test("downloadVideoFromUrl rejects empty url before touching yt-dlp", async () => {
  const { downloadVideoFromUrl } = await import("../src/url-ingest.ts");
  await assert.rejects(
    () => downloadVideoFromUrl("  ", "/tmp"),
    /URL is required/
  );
});

test("downloadVideoFromUrl throws UrlIngesterUnavailableError when yt-dlp missing", async () => {
  const { downloadVideoFromUrl } = await import("../src/url-ingest.ts");
  const prevPath = process.env.PATH;
  process.env.PATH = "";
  try {
    await assert.rejects(
      () => downloadVideoFromUrl("https://example.com/v.mp4", "/tmp"),
      (error: unknown) => error instanceof UrlIngesterUnavailableError
    );
  } finally {
    process.env.PATH = prevPath;
  }
});
