import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { serveRange } from "../src/serveRange.ts";

async function responseText(res: Response): Promise<string> {
  return Buffer.from(await res.arrayBuffer()).toString("utf8");
}

test("serveRange streams a whole file with no-store headers", async () => {
  const dir = mkdtempSync(join(tmpdir(), "openklip-range-"));
  try {
    const fp = join(dir, "proxy.mp4");
    writeFileSync(fp, "abcdef");
    const req = new Request("http://openklip.test/media/proxy.mp4");

    const res = await serveRange(req, fp, "video/mp4");

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "video/mp4");
    assert.equal(res.headers.get("Accept-Ranges"), "bytes");
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.equal(res.headers.get("Content-Length"), "6");
    assert.equal(await responseText(res), "abcdef");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("serveRange honors byte ranges for video seeking", async () => {
  const dir = mkdtempSync(join(tmpdir(), "openklip-range-"));
  try {
    const fp = join(dir, "proxy.mp4");
    writeFileSync(fp, "abcdef");
    const req = new Request("http://openklip.test/media/proxy.mp4", {
      headers: { Range: "bytes=1-3" },
    });

    const res = await serveRange(req, fp, "video/mp4");

    assert.equal(res.status, 206);
    assert.equal(res.headers.get("Content-Range"), "bytes 1-3/6");
    assert.equal(res.headers.get("Content-Length"), "3");
    assert.equal(await responseText(res), "bcd");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
