import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createProjectsPost,
  loadProjectIngest,
} from "../app/api/projects/post.ts";
import { GET, POST } from "../app/api/projects/route.ts";
import { getIngestJob, type IngestJob } from "../src/ingest-jobs.ts";
import { projectsRoot } from "../src/paths.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

// Ingest now runs as a background job; poll the registry until it settles.
async function pollJob(id: string): Promise<IngestJob> {
  for (let i = 0; i < 100; i += 1) {
    const job = getIngestJob(id);
    if (job && job.status !== "running") {
      return job;
    }
    await new Promise((r) => {
      setTimeout(r, 5);
    });
  }
  throw new Error("ingest job did not finish");
}

function ingestRequest(file?: File) {
  const form = new FormData();
  if (file) {
    form.append("file", file);
  }
  return new Request("http://localhost/api/projects", {
    method: "POST",
    body: form,
  }) as unknown as Parameters<typeof POST>[0];
}

async function openKlipTempDirs(root: string): Promise<Set<string>> {
  const names = await readdir(root);
  return new Set(names.filter((name) => name.startsWith("openklip-ingest-")));
}

test("GET /api/projects lists ingested projects", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const res = GET();
    assert.equal(res.status, 200);
    const json = (await res.json()) as Array<{ slug: string }>;
    assert.equal(json.length, 1);
    assert.equal(json[0]?.slug, slug);
  });
});

test("POST /api/projects returns 400 when file is missing", async () => {
  await withTempProjectsRoot(async () => {
    const res = await POST(ingestRequest());
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /missing file/i);
  });
});

test("POST /api/projects starts an ingest job and returns its id + slug", async () => {
  await withTempProjectsRoot(async () => {
    const post = createProjectsPost({
      // Like real ingest, the stub leaves a created project dir behind.
      loadIngest: async () => () => {
        writeFixtureProject(
          "uploaded-demo",
          makeProject({ slug: "uploaded-demo" })
        );
        return Promise.resolve("uploaded-demo");
      },
    });

    const res = await post(
      ingestRequest(new File(["fake-bytes"], "clip.mp4", { type: "video/mp4" }))
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as { jobId?: string; slug?: string };
    assert.ok(json.jobId);
    assert.equal(json.slug, "clip"); // derived from the filename, returned now

    // The job runs the injected ingest to completion.
    const done = await pollJob(json.jobId as string);
    assert.equal(done.status, "done");
    assert.equal(done.slug, "uploaded-demo");
  });
});

test("POST /api/projects production ingest loader resolves the route import", async () => {
  const ingest = await loadProjectIngest();
  assert.equal(typeof ingest, "function");
});

test("POST /api/projects cleans temp upload when ingest load fails", async () => {
  await withTempProjectsRoot(async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "openklip-route-test-"));
    try {
      const before = await openKlipTempDirs(tempRoot);
      const post = createProjectsPost({
        loadIngest: () => Promise.reject(new Error("load failed")),
        tempRoot,
      });

      await assert.rejects(
        post(ingestRequest(new File(["fake-bytes"], "cleanup.mp4"))),
        /load failed/
      );

      const after = await openKlipTempDirs(tempRoot);
      const leaked = [...after].filter((name) => !before.has(name));
      assert.deepEqual(leaked, []);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

test("POST /api/projects returns 409 when the project already exists", async () => {
  await withTempProjectsRoot(async () => {
    // The same-slug guard fires synchronously before any work starts.
    writeFixtureProject("demo", makeProject({ slug: "demo" }));

    const res = await POST(
      ingestRequest(new File(["fake-bytes"], "demo.mp4", { type: "video/mp4" }))
    );
    assert.equal(res.status, 409);
    const json = (await res.json()) as { code?: string; error?: string };
    // code "exists" is what lets the client offer the destructive replace.
    assert.equal(json.code, "exists");
    assert.match(json.error ?? "", /already exists/i);
  });
});

test("POST /api/projects returns 409 while an ingest for the slug is in flight", async () => {
  await withTempProjectsRoot(async () => {
    let release: (slug: string) => void = () => undefined;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });
    const post = createProjectsPost({
      // Slow ingest: the job stays "running" until the test opens the gate.
      loadIngest: async () => async () => {
        const slug = await gate;
        writeFixtureProject(slug, makeProject({ slug }));
        return slug;
      },
    });

    const first = await post(
      ingestRequest(new File(["fake-bytes"], "clip.mp4", { type: "video/mp4" }))
    );
    assert.equal(first.status, 200);
    const firstJson = (await first.json()) as { jobId?: string };
    assert.ok(firstJson.jobId);

    // Same filename -> same slug. Ingest wipes the project dir first and
    // writes project.json last, so the existsSync guard cannot cover this
    // window; the in-flight guard must.
    const second = await post(
      ingestRequest(new File(["fake-bytes"], "clip.mp4", { type: "video/mp4" }))
    );
    assert.equal(second.status, 409);
    const json = (await second.json()) as { code?: string; error?: string };
    // code "in-flight", NOT "exists": the client must show a plain failure,
    // never the replace-project confirmation.
    assert.equal(json.code, "in-flight");
    assert.match(json.error ?? "", /already in progress/i);

    // Settle the first job so the in-flight guard clears for later tests.
    release("clip");
    const done = await pollJob(firstJson.jobId as string);
    assert.equal(done.status, "done");
  });
});

test("POST /api/projects?force=1 passes force through to ingest", async () => {
  await withTempProjectsRoot(async () => {
    let receivedForce: boolean | undefined;
    const post = createProjectsPost({
      loadIngest: async () => (_video, opts) => {
        receivedForce = opts?.force;
        writeFixtureProject("force-demo", makeProject({ slug: "force-demo" }));
        return Promise.resolve("force-demo");
      },
    });

    const form = new FormData();
    form.append("file", new File(["fake-bytes"], "demo.mp4"));
    const req = new Request("http://localhost/api/projects?force=1", {
      method: "POST",
      body: form,
    }) as unknown as Parameters<typeof POST>[0];
    const res = await post(req);
    assert.equal(res.status, 200);
    const json = (await res.json()) as { jobId?: string };
    assert.ok(json.jobId);
    await pollJob(json.jobId);
    assert.equal(receivedForce, true);
  });
});

test("POST /api/projects rejects unsupported formats with actionable copy", async () => {
  await withTempProjectsRoot(async () => {
    const res = await POST(
      ingestRequest(new File(["hello"], "notes.txt", { type: "text/plain" }))
    );
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /unsupported/i);
    assert.match(json.error ?? "", /\.txt/);
    assert.match(json.error ?? "", /MP4, MOV, M4V, WebM, MKV, AVI/);
  });
});

test("POST /api/projects persists the upload and repoints project.json source", async () => {
  await withTempProjectsRoot(async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "openklip-route-test-"));
    try {
      const post = createProjectsPost({
        // Minimal stand-in for real ingest: creates the project dir and a
        // project.json whose source is the temp upload path it received.
        loadIngest: async () => (videoArg) => {
          const dir = join(projectsRoot(), "clip");
          mkdirSync(dir, { recursive: true });
          writeFileSync(
            join(dir, "project.json"),
            JSON.stringify({ slug: "clip", source: videoArg }, null, 2)
          );
          return Promise.resolve("clip");
        },
        tempRoot,
      });

      const res = await post(
        ingestRequest(
          new File(["fake-bytes"], "clip.mp4", { type: "video/mp4" })
        )
      );
      assert.equal(res.status, 200);
      const json = (await res.json()) as { jobId?: string };
      assert.ok(json.jobId);
      const done = await pollJob(json.jobId as string);
      assert.equal(done.status, "done");

      // The uploaded source survives at the project root and project.json
      // points at it, so full-res export does not degrade to the proxy.
      const stored = join(projectsRoot(), "clip", "clip.mp4");
      assert.ok(existsSync(stored), "uploaded source copied to project root");
      assert.equal(readFileSync(stored, "utf8"), "fake-bytes");
      const project = JSON.parse(
        readFileSync(join(projectsRoot(), "clip", "project.json"), "utf8")
      ) as { source?: string };
      assert.equal(project.source, stored);

      assert.deepEqual([...(await openKlipTempDirs(tempRoot))], []);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

test("POST /api/projects surfaces a persist failure as a partial-success job", async () => {
  await withTempProjectsRoot(async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "openklip-route-test-"));
    try {
      const post = createProjectsPost({
        // Ingest succeeds but blocks the copy target: a DIRECTORY already
        // sits where persistUploadedSource wants to store clip.mp4, so
        // copyFile throws and the failure lands in job.warning.
        loadIngest: async () => () => {
          const dir = join(projectsRoot(), "clip");
          mkdirSync(join(dir, "clip.mp4"), { recursive: true });
          writeFileSync(
            join(dir, "project.json"),
            JSON.stringify({ slug: "clip", source: "/tmp/x.mp4" }, null, 2)
          );
          return Promise.resolve("clip");
        },
        tempRoot,
      });

      const res = await post(
        ingestRequest(
          new File(["fake-bytes"], "clip.mp4", { type: "video/mp4" })
        )
      );
      assert.equal(res.status, 200);
      const json = (await res.json()) as { jobId?: string };
      assert.ok(json.jobId);
      const done = await pollJob(json.jobId as string);
      assert.equal(done.status, "partial");
      assert.equal(done.slug, "clip");
      assert.match(done.warning ?? "", /clip\.mp4|directory/i);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

test("POST /api/projects ingest failure surfaces the job error and cleans up", async () => {
  await withTempProjectsRoot(async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "openklip-route-test-"));
    try {
      const post = createProjectsPost({
        loadIngest: async () => () => Promise.reject(new Error("probe failed")),
        tempRoot,
      });

      const res = await post(
        ingestRequest(
          new File(["fake-bytes"], "clip.mp4", { type: "video/mp4" })
        )
      );
      assert.equal(res.status, 200);
      const json = (await res.json()) as { jobId?: string };
      assert.ok(json.jobId);
      const done = await pollJob(json.jobId as string);
      assert.equal(done.status, "error");
      assert.match(done.error ?? "", /probe failed/);

      assert.deepEqual([...(await openKlipTempDirs(tempRoot))], []);
      assert.ok(
        !existsSync(join(projectsRoot(), "clip", "clip.mp4")),
        "no stray copied source after a failed ingest"
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
