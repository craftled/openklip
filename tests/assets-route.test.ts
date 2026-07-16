// CRAFT-6179: the POST upload handler used to buffer the entire upload (up
// to MAX_ASSET_UPLOAD_BYTES, 4 GB) in memory via file.arrayBuffer() before
// registering it, which OOMs the process on large files. The fix streams the
// upload straight to a unique file under the project's assets/ dir and
// registers it path-based (registerAsset, the same primitive CLI `asset-add`
// uses) instead of buffering bytes (registerAssetBytes). Converted from
// node:test to bun:test (mock.module is bun:test-only, house style per
// verify-route.test.ts / cams.test.ts) so the failure-injection cases below
// can live alongside the pre-existing coverage in one file.
import { afterEach, mock, test } from "bun:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { readActionLog } from "../src/action-log.ts";
import * as realAssets from "../src/assets.ts";
import { FFMPEG } from "../src/ffmpeg.ts";
import * as realUploadLimits from "../src/upload-limits.ts";
import {
  brollClipFor,
  orphanBrollAsset,
  TINY_PNG,
} from "./helpers/assetFixture.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

const FFMPEG_OK = typeof FFMPEG === "string" && existsSync(FFMPEG);

// Snapshot the real bindings BEFORE mock.module runs: mock.module mutates
// the live module object in place, so referencing realAssets.registerAsset /
// realUploadLimits.MAX_ASSET_UPLOAD_BYTES from inside a mock factory would
// recurse into the mock itself once installed. The `original*` copies below
// are plain-object snapshots taken now, immune to that later mutation (house
// style: see projectStore.test.ts).
const originalAssets = { ...realAssets };
const originalUploadLimits = { ...realUploadLimits };

let registerMode: "fail" | "ok" = "ok";

// The route imports registerAsset from "@engine/assets": mock that
// specifier (not the relative "../src/assets.ts" path) so the alias-resolved
// module the route actually loads is the one that gets intercepted (same
// pattern as verify-route.test.ts mocking "@engine/verify").
mock.module("@engine/assets", () => ({
  ...originalAssets,
  registerAsset: (...args: Parameters<typeof originalAssets.registerAsset>) => {
    if (registerMode === "fail") {
      throw new Error("injected registration failure");
    }
    return originalAssets.registerAsset(...args);
  },
}));

// The real cap is 4 GB; exercising the 413 path for real would mean
// allocating gigabytes in the test process. Bun's mock.module snapshots a
// getter's value on first read (verified experimentally: later reads of the
// same mocked export do not re-invoke the getter), so a per-test toggle
// isn't viable here either — the whole file gets one fixed, much smaller
// cap instead. Every other fixture in this file (sine-wave mp3, 64x64 1s
// testsrc mp4, a 4-byte PNG) sits far under it; only the oversize and
// large-upload-streaming tests below size their payloads relative to it.
const TEST_UPLOAD_CAP_BYTES = 8 * 1024 * 1024;
mock.module("@engine/upload-limits", () => ({
  ...originalUploadLimits,
  MAX_ASSET_UPLOAD_BYTES: TEST_UPLOAD_CAP_BYTES,
}));

afterEach(() => {
  registerMode = "ok";
  mock.restore();
});

function loadRoute() {
  return import("../app/api/projects/[slug]/assets/route.ts");
}

function loadSyncRoute() {
  return import("../app/api/projects/[slug]/assets/sync/route.ts");
}

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

type Ctx = ReturnType<typeof ctx>;

function postAsset<T extends (req: never, ctx: Ctx) => Promise<Response>>(
  POST: T,
  slug: string,
  file: File,
  extraFields: Record<string, string> = {}
) {
  const form = new FormData();
  form.append("file", file);
  for (const [key, value] of Object.entries(extraFields)) {
    form.append(key, value);
  }
  const req = new Request(`http://localhost/api/projects/${slug}/assets`, {
    method: "POST",
    body: form,
  });
  return POST(req as Parameters<T>[0], ctx(slug));
}

interface AssetResponse {
  asset?: { id: string; kind: string; src: string };
  assets?: unknown[];
  byKind?: { broll: unknown[]; music: unknown[]; still: unknown[] };
  error?: string;
}

function assetsDirFor(root: string, slug: string): string {
  return join(root, "projects", slug, "assets");
}

function proxiesDirFor(root: string, slug: string): string {
  return join(root, "projects", slug, "working", "assets");
}

function readProjectFile(root: string, slug: string): { assets: unknown[] } {
  return JSON.parse(
    readFileSync(join(root, "projects", slug, "project.json"), "utf8")
  );
}

test("assets route source no longer buffers uploads via file.arrayBuffer()", () => {
  const routeSourcePath = new URL(
    "../app/api/projects/[slug]/assets/route.ts",
    import.meta.url
  ).pathname;
  const source = readFileSync(routeSourcePath, "utf8");
  assert.ok(
    !/\.arrayBuffer\s*\(/.test(source),
    "route.ts must stream the upload to disk instead of calling arrayBuffer()"
  );
});

test("POST /api/projects/:slug/assets registers music without calling File#arrayBuffer", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  const { POST } = await loadRoute();
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
        "/tmp/openklip-craft6179-track.mp3",
      ],
      { stdout: "ignore", stderr: "pipe" }
    );
    assert.equal(await proc.exited, 0);

    const bytes = readFileSync("/tmp/openklip-craft6179-track.mp3");
    const original = File.prototype.arrayBuffer;
    let arrayBufferCalls = 0;
    File.prototype.arrayBuffer = function patched(
      ...args: Parameters<typeof original>
    ) {
      arrayBufferCalls += 1;
      return original.apply(this, args);
    };
    let res: Response;
    try {
      res = await postAsset(
        POST,
        slug,
        new File([bytes], "track.mp3", { type: "audio/mpeg" })
      );
    } finally {
      File.prototype.arrayBuffer = original;
    }
    const data = (await res.json()) as AssetResponse;

    assert.equal(res.status, 200);
    assert.equal(data.asset?.kind, "music");
    assert.ok(Array.isArray(data.assets) && data.assets.length === 1);
    assert.equal(arrayBufferCalls, 0);

    // registerAsset owns its own locking via mutateProject (the route no
    // longer wraps it in withProjectLock, which would deadlock); the
    // upload must still be a logged, revision-bumping mutation.
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "asset-add");
    assert.equal(entries[0].actor, "human");
    assert.equal(entries[0].revisionAfter, 1);
  });
});

test("POST /api/projects/:slug/assets registers broll (video) without calling File#arrayBuffer", {
  skip: FFMPEG_OK ? false : "ffmpeg binary unavailable",
}, async () => {
  const { POST } = await loadRoute();
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));

    const proc = Bun.spawn(
      [
        FFMPEG,
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=1:size=64x64:rate=10",
        "-pix_fmt",
        "yuv420p",
        "/tmp/openklip-craft6179-clip.mp4",
      ],
      { stdout: "ignore", stderr: "pipe" }
    );
    assert.equal(await proc.exited, 0);

    const bytes = readFileSync("/tmp/openklip-craft6179-clip.mp4");
    const original = File.prototype.arrayBuffer;
    let arrayBufferCalls = 0;
    File.prototype.arrayBuffer = function patched(
      ...args: Parameters<typeof original>
    ) {
      arrayBufferCalls += 1;
      return original.apply(this, args);
    };
    let res: Response;
    try {
      res = await postAsset(
        POST,
        slug,
        new File([bytes], "clip.mp4", { type: "video/mp4" })
      );
    } finally {
      File.prototype.arrayBuffer = original;
    }
    const data = (await res.json()) as AssetResponse;

    assert.equal(res.status, 200);
    assert.equal(data.asset?.kind, "broll");
    assert.ok(Array.isArray(data.assets) && data.assets.length === 1);
    assert.equal(arrayBufferCalls, 0);

    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "asset-add");
    assert.equal(entries[0].actor, "human");
  });
});

test("POST /api/projects/:slug/assets registers a still without calling File#arrayBuffer", async () => {
  const { POST } = await loadRoute();
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));

    const original = File.prototype.arrayBuffer;
    let arrayBufferCalls = 0;
    File.prototype.arrayBuffer = function patched(
      ...args: Parameters<typeof original>
    ) {
      arrayBufferCalls += 1;
      return original.apply(this, args);
    };
    let res: Response;
    try {
      res = await postAsset(
        POST,
        slug,
        new File([TINY_PNG], "still.png", { type: "image/png" }),
        { kind: "still" }
      );
    } finally {
      File.prototype.arrayBuffer = original;
    }
    const data = (await res.json()) as AssetResponse;

    assert.equal(res.status, 200);
    assert.equal(data.asset?.kind, "still");
    assert.ok(Array.isArray(data.assets) && data.assets.length === 1);
    assert.equal(arrayBufferCalls, 0);

    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "asset-add");
  });
});

test("POST /api/projects/:slug/assets returns JSON error for missing file", async () => {
  const { POST } = await loadRoute();
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const form = new FormData();
    const req = new Request(`http://localhost/api/projects/${slug}/assets`, {
      method: "POST",
      body: form,
    });
    const res = await POST(req as Parameters<typeof POST>[0], ctx(slug));
    assert.equal(res.status, 400);
    const data = (await res.json()) as AssetResponse;
    assert.match(data.error ?? "", /missing file/i);
  });
});

test("POST /api/projects/:slug/assets returns 413 and registers nothing when declared size exceeds the cap", async () => {
  const { POST } = await loadRoute();
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));

    const bytes = Buffer.alloc(TEST_UPLOAD_CAP_BYTES + 1024, 7);
    const res = await postAsset(
      POST,
      slug,
      new File([bytes], "big.bin", { type: "application/octet-stream" })
    );
    assert.equal(res.status, 413);
    const data = (await res.json()) as AssetResponse;
    assert.match(data.error ?? "", /limit/i);

    // Nothing may have been streamed to disk or registered before the 413.
    assert.deepEqual(readdirSync(assetsDirFor(root, slug)), []);
    assert.equal(readProjectFile(root, slug).assets.length, 0);
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 0);
  });
});

test("POST /api/projects/:slug/assets cleans up the streamed file when registration fails", async () => {
  registerMode = "fail";
  const { POST } = await loadRoute();
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));

    const res = await postAsset(
      POST,
      slug,
      new File([TINY_PNG], "still.png", { type: "image/png" }),
      { kind: "still" }
    );
    assert.equal(res.status, 500);
    const data = (await res.json()) as AssetResponse;
    assert.match(data.error ?? "", /injected registration failure/);

    // The streamed source file must not survive a failed registration.
    assert.deepEqual(readdirSync(assetsDirFor(root, slug)), []);
    const proxiesDir = proxiesDirFor(root, slug);
    if (existsSync(proxiesDir)) {
      assert.deepEqual(readdirSync(proxiesDir), []);
    }
    assert.equal(readProjectFile(root, slug).assets.length, 0);
    const entries = await readActionLog(slug);
    assert.equal(entries.length, 0);
  });
});

test("POST /api/projects/:slug/assets streams a large upload to disk incrementally without buffering it whole", async () => {
  const { POST } = await loadRoute();
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));

    // 6 MB across 6 chunks (comfortably under the file's fixed test upload
    // cap of 8 MB, see TEST_UPLOAD_CAP_BYTES above): big enough that a
    // naive arrayBuffer() copy would be visible, small enough to stay fast
    // in CI. A direct process.memoryUsage().heapUsed before/after
    // comparison was tried here and found flaky: the test's own multi-MB
    // source chunks, GC timing, and V8's heap growth policy all swamp the
    // signal. The deterministic and stronger substitute below asserts the
    // actual invariant the fix is for: the route path taken for this
    // request never materializes the file through arrayBuffer(), and the
    // full byte count still lands on disk (proving the streaming loop
    // drained every chunk, not just the first one).
    const chunkSize = 1024 * 1024;
    const chunkCount = 6;
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < chunkCount; i++) {
      chunks.push(new Uint8Array(chunkSize).fill(i % 256));
    }
    const file = new File(chunks, "large.png", { type: "image/png" });

    const original = File.prototype.arrayBuffer;
    let arrayBufferCalls = 0;
    File.prototype.arrayBuffer = function patched(
      ...args: Parameters<typeof original>
    ) {
      arrayBufferCalls += 1;
      return original.apply(this, args);
    };
    let res: Response;
    try {
      res = await postAsset(POST, slug, file, { kind: "still" });
    } finally {
      File.prototype.arrayBuffer = original;
    }
    const data = (await res.json()) as AssetResponse;

    assert.equal(res.status, 200);
    assert.equal(data.asset?.kind, "still");
    assert.equal(arrayBufferCalls, 0);

    const assetsDir = assetsDirFor(root, slug);
    const stored = readdirSync(assetsDir).find((f) => f.startsWith("large"));
    assert.ok(stored, "streamed file should be persisted under assets/");
    const written = statSync(join(assetsDir, stored as string));
    assert.equal(written.size, chunkSize * chunkCount);
  });
});

test("GET /api/projects/:slug/assets is pure: does not register dropped files", async () => {
  const { GET } = await loadRoute();
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
  const { POST: SYNC_POST } = await loadSyncRoute();
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
  const { POST: SYNC_POST } = await loadSyncRoute();
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
