import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type Broll, SAMPLE_RATE } from "../src/edl.ts";
import {
  chooseAssetInput,
  chooseSourceInput,
  planBrollForRanges,
} from "../src/exporter.ts";

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "openklip-exporter-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("chooseSourceInput prefers the original source when it exists", () => {
  withTempDir((dir) => {
    const source = join(dir, "source.mp4");
    const proxy = join(dir, "proxy.mp4");
    writeFileSync(source, "source");
    writeFileSync(proxy, "proxy");

    const picked = chooseSourceInput({ dir, proxy, source });

    assert.equal(picked.path, source);
    assert.equal(picked.kind, "original");
  });
});

test("chooseSourceInput falls back to the project proxy when the source is missing", () => {
  withTempDir((dir) => {
    const proxy = join(dir, "proxy.mp4");
    writeFileSync(proxy, "proxy");

    const picked = chooseSourceInput({
      dir,
      proxy: "proxy.mp4",
      source: join(dir, "missing.mp4"),
    });

    assert.equal(picked.path, proxy);
    assert.equal(picked.kind, "proxy");
  });
});

test("chooseSourceInput gives an actionable error when no video input exists", () => {
  withTempDir((dir) => {
    assert.throws(
      () =>
        chooseSourceInput({
          dir,
          proxy: "proxy.mp4",
          source: join(dir, "missing.mp4"),
        }),
      /missing source video/
    );
  });
});

test("chooseAssetInput falls back to the proxied project asset when the source asset is missing", () => {
  withTempDir((dir) => {
    const assetDir = join(dir, "assets");
    const proxy = join(assetDir, "b-roll.mp4");
    mkdirSync(assetDir);
    writeFileSync(proxy, "proxy", { flag: "w" });

    const picked = chooseAssetInput(dir, {
      id: "b-roll",
      name: "b-roll.mp4",
      src: join(dir, "missing-b-roll.mp4"),
      proxy: "assets/b-roll.mp4",
      durationSamples: 48_000,
    });

    assert.equal(picked.path, proxy);
    assert.equal(picked.kind, "proxy");
  });
});

test("planBrollForRanges splits a b-roll cover across deleted gaps", () => {
  const broll: Broll = {
    id: "br1",
    assetId: "b-roll",
    startSample: Math.round(0.5 * SAMPLE_RATE),
    endSample: Math.round(3.5 * SAMPLE_RATE),
    srcInSample: 0,
  };

  const plans = planBrollForRanges({
    broll,
    firstInputIndex: 1,
    ranges: [
      { startSec: 0, endSec: 1 },
      { startSec: 3, endSec: 5 },
    ],
    sampleRate: SAMPLE_RATE,
    srcPath: "/tmp/b-roll.mp4",
  });

  assert.deepEqual(
    plans.map((p) => ({
      inputIndex: p.inputIndex,
      outEnd: p.outEnd,
      outStart: p.outStart,
      srcInSec: p.srcInSec,
    })),
    [
      { inputIndex: 1, outEnd: 1, outStart: 0.5, srcInSec: 0 },
      { inputIndex: 2, outEnd: 1.5, outStart: 1, srcInSec: 2.5 },
    ]
  );
});
