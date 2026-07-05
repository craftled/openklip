import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { chooseSourceInput } from "../src/exporter.ts";
import { resolveSourceMediaStatus } from "../src/source-media.ts";

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "openklip-source-media-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("resolveSourceMediaStatus prefers original source when present", () => {
  withTempDir((dir) => {
    const source = join(dir, "source.mp4");
    writeFileSync(source, "src");
    const status = resolveSourceMediaStatus({
      dir,
      source,
      proxy: "proxy.mp4",
    });
    assert.equal(status.kind, "original");
    assert.equal(status.path, source);
    assert.equal(status.warn, undefined);
  });
});

test("resolveSourceMediaStatus warns when falling back to proxy", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "proxy.mp4"), "proxy");
    const missing = join(dir, "missing.mp4");
    const status = resolveSourceMediaStatus({
      dir,
      proxy: "proxy.mp4",
      source: missing,
    });
    assert.equal(status.kind, "proxy");
    assert.match(status.warn ?? "", /Original source missing/);
    assert.match(status.warn ?? "", /720p proxy/);
  });
});

test("chooseSourceInput throws when neither source nor proxy exists", () => {
  withTempDir((dir) => {
    assert.throws(
      () =>
        chooseSourceInput({
          dir,
          proxy: "proxy.mp4",
          source: join(dir, "missing.mp4"),
        }),
      /No source or proxy/
    );
  });
});
