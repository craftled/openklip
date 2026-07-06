import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readActionLog } from "../src/action-log.ts";
import {
  createAgentTask,
  resetAgentTaskIdSequenceForTests,
} from "../src/agent-tasks.ts";
import { ProjectSchema, SAMPLE_RATE } from "../src/edl.ts";
import {
  PRODUCT_ANNOUNCEMENT_CATALOG,
  PRODUCT_ANNOUNCEMENT_LIMITS,
  sampleProductAnnouncementSpec,
  validateProductAnnouncementSpec,
} from "../src/product-announcement.ts";
import { renderProductAnnouncementHtml } from "../src/product-announcement-html.tsx";
import { loadProject, mutateProject } from "../src/projectStore.ts";
import {
  actionManifest,
  actions,
  actionTable,
  runAction,
} from "../src/registry.ts";
import { PreviewOverlays } from "../web/components/preview-overlays";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

const CLI = join(import.meta.dir, "../src/cli.ts");

async function runCli(args: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out: stdout + stderr };
}

test("product announcement spec validates selected component props", () => {
  const valid = validateProductAnnouncementSpec(sampleProductAnnouncementSpec);
  assert.equal(valid.success, true);
  assert.ok(valid.spec);

  const hallucinated = structuredClone(sampleProductAnnouncementSpec);
  hallucinated.elements.hero.type = "MagicDemoWidget";
  const hallucinatedResult = validateProductAnnouncementSpec(hallucinated);
  assert.equal(hallucinatedResult.success, false);
  assert.match(hallucinatedResult.issues.join("\n"), /MagicDemoWidget|Invalid/);

  const invalidProps = structuredClone(sampleProductAnnouncementSpec);
  invalidProps.elements.snippet.props = {
    code: "openklip export",
    language: "python",
  };
  const invalidPropsResult = validateProductAnnouncementSpec(invalidProps);
  assert.equal(invalidPropsResult.success, false);
  assert.match(invalidPropsResult.issues.join("\n"), /language/);

  const invalidAccent = structuredClone(sampleProductAnnouncementSpec);
  invalidAccent.elements.scene.props = {
    ...invalidAccent.elements.scene.props,
    accent: "url(https://example.com/pixel)",
  };
  const invalidAccentResult = validateProductAnnouncementSpec(invalidAccent);
  assert.equal(invalidAccentResult.success, false);
  assert.match(invalidAccentResult.issues.join("\n"), /accent/);
});

test("product announcement spec rejects unsafe graph shapes", () => {
  const wrongRoot = structuredClone(sampleProductAnnouncementSpec);
  wrongRoot.root = "hero";
  const wrongRootResult = validateProductAnnouncementSpec(wrongRoot);
  assert.equal(wrongRootResult.success, false);
  assert.match(wrongRootResult.issues.join("\n"), /AnnouncementScene/);

  const cyclic = structuredClone(sampleProductAnnouncementSpec);
  cyclic.elements.scene.children = ["scene"];
  const cyclicResult = validateProductAnnouncementSpec(cyclic);
  assert.equal(cyclicResult.success, false);
  assert.match(cyclicResult.issues.join("\n"), /cyclic child graph/);

  const orphaned = structuredClone(sampleProductAnnouncementSpec);
  orphaned.elements.ghost = {
    children: [],
    props: {
      code: "openklip export",
      language: "bash",
    },
    type: "CodeSnippet",
    visible: true,
  };
  const orphanedResult = validateProductAnnouncementSpec(orphaned);
  assert.equal(orphanedResult.success, false);
  assert.match(orphanedResult.issues.join("\n"), /orphaned element/);

  const tooLarge = structuredClone(sampleProductAnnouncementSpec);
  for (let i = 0; i < 40; i++) {
    tooLarge.elements[`extra${i}`] = {
      children: [],
      props: {
        code: "openklip export",
        language: "bash",
      },
      type: "CodeSnippet",
      visible: true,
    };
  }
  const tooLargeResult = validateProductAnnouncementSpec(tooLarge);
  assert.equal(tooLargeResult.success, false);
  assert.match(tooLargeResult.issues.join("\n"), /40 or fewer elements/);

  const tooLongText = structuredClone(sampleProductAnnouncementSpec);
  tooLongText.elements.hero.props = {
    ...tooLongText.elements.hero.props,
    headline: "x".repeat(PRODUCT_ANNOUNCEMENT_LIMITS.textChars + 1),
  };
  const tooLongResult = validateProductAnnouncementSpec(tooLongText);
  assert.equal(tooLongResult.success, false);
  assert.match(tooLongResult.issues.join("\n"), /headline/);

  const tooLargeBytes = structuredClone(sampleProductAnnouncementSpec);
  tooLargeBytes.elements.hero.props = {
    ...tooLargeBytes.elements.hero.props,
    headline: "x".repeat(PRODUCT_ANNOUNCEMENT_LIMITS.specBytes),
  };
  const tooLargeBytesResult = validateProductAnnouncementSpec(tooLargeBytes);
  assert.equal(tooLargeBytesResult.success, false);
  assert.match(tooLargeBytesResult.issues.join("\n"), /too large|headline/);
});

test("product announcement static render is native markup without script output", async () => {
  const html = await renderProductAnnouncementHtml(
    sampleProductAnnouncementSpec
  );

  assert.match(html, /data-graphic-root/);
  assert.match(html, /JSON specs become export-ready motion graphics/);
  assert.match(html, /openklip json-graphic-add/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<iframe/i);
});

test("registry exposes json graphic mutations to every surface", () => {
  const table = actionTable();
  assert.match(table, /json-graphic-add/);
  assert.match(table, /json-graphic-set/);

  const manifest = actionManifest("mcp");
  const add = manifest.find((entry) => entry.name === "json-graphic-add");
  const set = manifest.find((entry) => entry.name === "json-graphic-set");
  assert.ok(add);
  assert.ok(set);
  assert.deepEqual(add.surfaces, ["cli", "gui", "mcp"]);
  assert.ok(add.inputSchema.properties?.spec);
});

test("json-graphic-add mutates project only after catalog and spec validation", () => {
  const project = makeProject({ slug: "registry-json" });
  const item = runAction("json-graphic-add", project, {
    catalog: PRODUCT_ANNOUNCEMENT_CATALOG,
    fromSec: 1,
    toSec: 4,
    spec: sampleProductAnnouncementSpec,
  }) as { catalog?: string; id: string; type?: string };

  assert.equal(item.type, "json-render");
  assert.equal(item.catalog, PRODUCT_ANNOUNCEMENT_CATALOG);
  assert.equal(project.graphics?.length, 1);

  const nextItem = runAction("json-graphic-add", project, {
    catalog: PRODUCT_ANNOUNCEMENT_CATALOG,
    fromSec: 4,
    toSec: 5,
    spec: sampleProductAnnouncementSpec,
  }) as { id: string };
  assert.notEqual(nextItem.id, item.id);

  const badCatalog = makeProject({ slug: "bad-catalog" });
  assert.throws(() =>
    runAction("json-graphic-add", badCatalog, {
      catalog: "other-catalog",
      fromSec: 1,
      toSec: 4,
      spec: sampleProductAnnouncementSpec,
    })
  );
  assert.equal(badCatalog.graphics?.length ?? 0, 0);

  const badSpec = makeProject({ slug: "bad-spec" });
  const hallucinated = structuredClone(sampleProductAnnouncementSpec);
  hallucinated.elements.hero.type = "MagicDemoWidget";
  assert.throws(() =>
    runAction("json-graphic-add", badSpec, {
      catalog: PRODUCT_ANNOUNCEMENT_CATALOG,
      fromSec: 1,
      toSec: 4,
      spec: hallucinated,
    })
  );
  assert.equal(badSpec.graphics?.length ?? 0, 0);
});

test("json-graphic-set patches a json-render graphic and rejects invalid specs", () => {
  const project = makeProject({ slug: "set-json" });
  const item = runAction("json-graphic-add", project, {
    catalog: PRODUCT_ANNOUNCEMENT_CATALOG,
    fromSec: 1,
    toSec: 4,
    spec: sampleProductAnnouncementSpec,
  }) as { id: string };

  const nextSpec = structuredClone(sampleProductAnnouncementSpec);
  nextSpec.elements.hero.props = {
    ...nextSpec.elements.hero.props,
    headline: "Validated graphics now patch cleanly",
  };
  const patched = runAction("json-graphic-set", project, {
    id: item.id,
    fromSec: 2,
    toSec: 6,
    spec: nextSpec,
    track: "zoom",
  }) as {
    endSample: number;
    spec?: typeof sampleProductAnnouncementSpec;
    startSample: number;
    track: string;
  };

  assert.equal(patched.startSample, SAMPLE_RATE * 2);
  assert.equal(patched.endSample, SAMPLE_RATE * 6);
  assert.equal(patched.track, "zoom");
  assert.equal(
    patched.spec?.elements.hero.props.headline,
    "Validated graphics now patch cleanly"
  );

  const before = structuredClone(project.graphics?.[0]);
  const invalidSpec = structuredClone(sampleProductAnnouncementSpec);
  invalidSpec.elements.hero.type = "MagicDemoWidget";
  assert.throws(() =>
    runAction("json-graphic-set", project, {
      id: item.id,
      spec: invalidSpec,
    })
  );
  assert.deepEqual(project.graphics?.[0], before);

  const templateProject = makeProject({
    slug: "template-graphic",
    graphics: [
      {
        id: "g-template",
        template: "lower-third",
        params: {},
        startSample: 0,
        endSample: SAMPLE_RATE,
        track: "title",
      },
    ],
  });
  assert.throws(() =>
    runAction("json-graphic-set", templateProject, {
      id: "g-template",
      spec: sampleProductAnnouncementSpec,
    })
  );
});

test("legacy template graphics still parse without json-render fields", () => {
  const parsed = ProjectSchema.parse({
    ...makeProject({ slug: "legacy-graphic" }),
    graphics: [
      {
        id: "g1",
        template: "lower-third",
        params: { title: "OpenKlip" },
        startSample: 0,
        endSample: SAMPLE_RATE,
        track: "title",
      },
    ],
  });

  assert.equal(parsed.graphics[0].type, undefined);
  assert.equal(parsed.graphics[0].template, "lower-third");
  assert.deepEqual(parsed.graphics[0].params, { title: "OpenKlip" });
});

test("json-render graphics require catalog and spec in project JSON", () => {
  assert.throws(() =>
    ProjectSchema.parse({
      ...makeProject({ slug: "broken-json-graphic" }),
      graphics: [
        {
          id: "g-json",
          type: "json-render",
          template: PRODUCT_ANNOUNCEMENT_CATALOG,
          params: {},
          startSample: 0,
          endSample: SAMPLE_RATE,
          track: "title",
        },
      ],
    })
  );

  assert.throws(() =>
    ProjectSchema.parse({
      ...makeProject({ slug: "ambiguous-json-graphic" }),
      graphics: [
        {
          id: "g-json",
          template: PRODUCT_ANNOUNCEMENT_CATALOG,
          catalog: PRODUCT_ANNOUNCEMENT_CATALOG,
          params: {},
          spec: sampleProductAnnouncementSpec,
          startSample: 0,
          endSample: SAMPLE_RATE,
          track: "title",
        },
      ],
    })
  );
});

test("json-graphic action schema applies product announcement validation", () => {
  const addAction = actions.find(
    (action) => action.name === "json-graphic-add"
  );
  assert.ok(addAction);

  const invalidSpec = structuredClone(sampleProductAnnouncementSpec);
  invalidSpec.elements.hero.type = "MagicDemoWidget";

  const result = addAction.schema.safeParse({
    catalog: PRODUCT_ANNOUNCEMENT_CATALOG,
    fromSec: 0,
    spec: invalidSpec,
    toSec: 1,
  });

  assert.equal(result.success, false);
});

test("preview overlays branch to the json-render renderer", () => {
  const html = renderToStaticMarkup(
    <PreviewOverlays
      captionGroups={[]}
      captionsOn={false}
      curSample={SAMPLE_RATE * 2}
      graphics={[
        {
          id: "g-json",
          type: "json-render",
          template: PRODUCT_ANNOUNCEMENT_CATALOG,
          catalog: PRODUCT_ANNOUNCEMENT_CATALOG,
          params: {},
          spec: sampleProductAnnouncementSpec,
          startSample: SAMPLE_RATE,
          endSample: SAMPLE_RATE * 5,
          track: "title",
        },
      ]}
      sampleRate={SAMPLE_RATE}
      titles={[]}
    />
  );

  assert.match(html, /ok-pa-root/);
  assert.match(html, /Announcement graphic|JSON specs become export-ready/);
});

test("preview overlays show invalid json-render graphic errors", () => {
  const invalidSpec = structuredClone(sampleProductAnnouncementSpec);
  invalidSpec.elements.hero.type = "MagicDemoWidget";

  const html = renderToStaticMarkup(
    <PreviewOverlays
      captionGroups={[]}
      captionsOn={false}
      curSample={SAMPLE_RATE * 2}
      graphics={[
        {
          id: "g-json",
          type: "json-render",
          template: PRODUCT_ANNOUNCEMENT_CATALOG,
          catalog: PRODUCT_ANNOUNCEMENT_CATALOG,
          params: {},
          spec: invalidSpec,
          startSample: SAMPLE_RATE,
          endSample: SAMPLE_RATE * 5,
          track: "title",
        },
      ]}
      sampleRate={SAMPLE_RATE}
      titles={[]}
    />
  );

  assert.match(html, /Invalid graphic spec/);
  assert.match(html, /MagicDemoWidget|Invalid/);
});

test("CLI json-graphic-add reads a spec file and mutates project graphics", async () => {
  await withTempProjectsRoot(async ({ root, slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const specPath = join(root, "announcement-spec.json");
    writeFileSync(specPath, JSON.stringify(sampleProductAnnouncementSpec));

    const result = await runCli([
      "json-graphic-add",
      slug,
      PRODUCT_ANNOUNCEMENT_CATALOG,
      "1",
      "4",
      "--spec-file",
      specPath,
    ]);
    assert.equal(result.code, 0);
    assert.match(result.out, /added JSON graphic/);

    const overlays = await runCli(["overlays", slug, "--json"]);
    assert.equal(overlays.code, 0);
    const data = JSON.parse(overlays.out.trim()) as {
      graphics: Array<{ catalog?: string; type: string }>;
    };
    assert.equal(data.graphics.length, 1);
    assert.equal(data.graphics[0].type, "json-render");
    assert.equal(data.graphics[0].catalog, PRODUCT_ANNOUNCEMENT_CATALOG);
  });
});

test("CLI json-graphic-add rejects invalid input without mutating graphics", async () => {
  await withTempProjectsRoot(async ({ root, slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const validSpecPath = join(root, "valid-announcement-spec.json");
    const malformedSpecPath = join(root, "malformed-announcement-spec.json");
    const invalidSpecPath = join(root, "invalid-announcement-spec.json");
    writeFileSync(validSpecPath, JSON.stringify(sampleProductAnnouncementSpec));
    writeFileSync(malformedSpecPath, "{not json");

    const invalidSpec = structuredClone(sampleProductAnnouncementSpec);
    invalidSpec.elements.hero.type = "MagicDemoWidget";
    writeFileSync(invalidSpecPath, JSON.stringify(invalidSpec));

    const missingFile = await runCli([
      "json-graphic-add",
      slug,
      PRODUCT_ANNOUNCEMENT_CATALOG,
      "1",
      "4",
    ]);
    assert.notEqual(missingFile.code, 0);
    assert.match(missingFile.out, /--spec-file is required/);

    const unknownCatalog = await runCli([
      "json-graphic-add",
      slug,
      "other-catalog",
      "1",
      "4",
      "--spec-file",
      validSpecPath,
    ]);
    assert.notEqual(unknownCatalog.code, 0);
    assert.match(unknownCatalog.out, /unknown json-render catalog/);

    const malformedJson = await runCli([
      "json-graphic-add",
      slug,
      PRODUCT_ANNOUNCEMENT_CATALOG,
      "1",
      "4",
      "--spec-file",
      malformedSpecPath,
    ]);
    assert.notEqual(malformedJson.code, 0);
    assert.match(malformedJson.out, /could not read --spec-file/);

    const invalidComponent = await runCli([
      "json-graphic-add",
      slug,
      PRODUCT_ANNOUNCEMENT_CATALOG,
      "1",
      "4",
      "--spec-file",
      invalidSpecPath,
    ]);
    assert.notEqual(invalidComponent.code, 0);
    assert.match(
      invalidComponent.out,
      /invalid input for "json-graphic-add": spec:/
    );

    const invalidTiming = await runCli([
      "json-graphic-add",
      slug,
      PRODUCT_ANNOUNCEMENT_CATALOG,
      "4",
      "1",
      "--spec-file",
      validSpecPath,
    ]);
    assert.notEqual(invalidTiming.code, 0);
    assert.match(invalidTiming.out, /span is empty/);

    const overlays = await runCli(["overlays", slug, "--json"]);
    assert.equal(overlays.code, 0);
    const data = JSON.parse(overlays.out.trim()) as {
      graphics?: Array<unknown>;
    };
    assert.equal(data.graphics?.length ?? 0, 0);
  });
});

// ── ACTION HISTORY: CLI paths that bypassed logging now go through
// mutateProject / the shared brief-log helper. These live in THIS file
// (which already spawns `bun run <cli.ts>` subprocesses) so history-related
// CLI tests share the same runCli helper.

test("CLI template set logs a template-set entry and bumps revision", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli(["template", "set", slug, "talking-head"]);
    assert.equal(result.code, 0, result.out);

    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "template-set");
    assert.equal(entries[0].actor, "cli");
    assert.equal(entries[0].revisionBefore, 0);
    assert.equal(entries[0].revisionAfter, 1);
  });
});

test("CLI brand logs a brand entry and bumps revision", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli(["brand", slug, "default"]);
    assert.equal(result.code, 0, result.out);

    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "brand");
    assert.equal(entries[0].actor, "cli");
    assert.equal(entries[0].revisionBefore, 0);
    assert.equal(entries[0].revisionAfter, 1);
  });
});

test("CLI brief --set logs a brief-set entry that does not move the project revision", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli([
      "brief",
      slug,
      "--set",
      "Audience: founders. Goal: ship the demo.",
    ]);
    assert.equal(result.code, 0, result.out);

    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "brief-set");
    assert.equal(entries[0].actor, "cli");
    assert.equal(entries[0].revisionBefore, entries[0].revisionAfter);
  });
});

test("CLI asset-add logs an asset-add entry with actor cli", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug, assets: [] }));
    const stillPath = join(root, "incoming.png");
    await Bun.write(stillPath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    const result = await runCli([
      "asset-add",
      slug,
      stillPath,
      "--kind",
      "still",
    ]);
    assert.equal(result.code, 0, result.out);

    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "asset-add");
    assert.equal(entries[0].actor, "cli");
    assert.equal(entries[0].revisionAfter, 1);
  });
});

// ── CLI revert: openklip revert <slug> (--to|--task|--last) [--force] ──────

test("CLI revert --to restores an earlier revision and prints the outcome", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const first = await runCli(["pad", slug, "10"]);
    assert.equal(first.code, 0, first.out);
    const second = await runCli(["pad", slug, "20"]);
    assert.equal(second.code, 0, second.out);

    const result = await runCli(["revert", slug, "--to", "0"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /revision 0/);
    assert.match(result.out, /revision 3/);

    const entries = await readActionLog(slug);
    assert.equal(entries[0].action, "revert");
    assert.equal(entries[0].actor, "cli");
  });
});

test("CLI revert --last reverts the most recent logged edit", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await runCli(["pad", slug, "10"]);
    const result = await runCli(["revert", slug, "--last"]);
    assert.equal(result.code, 0, result.out);
    const entries = await readActionLog(slug);
    assert.equal(entries[0].action, "revert");
  });
});

test("CLI revert requires exactly one of --to/--task/--last", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli(["revert", slug]);
    assert.notEqual(result.code, 0);
    assert.match(result.out, /usage: openklip revert/);
  });
});

test("CLI revert --to a missing snapshot fails with a clear error", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await runCli(["pad", slug, "10"]);
    const result = await runCli(["revert", slug, "--to", "9"]);
    assert.notEqual(result.code, 0);
    assert.match(result.out, /no snapshot for revision 9/);
  });
});

test("CLI revert --to rejects a non-numeric revision", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli(["revert", slug, "--to", "abc"]);
    assert.notEqual(result.code, 0);
    assert.match(result.out, /--to must be a non-negative integer revision/);
  });
});

test("CLI revert --to rejects a negative revision", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli(["revert", slug, "--to", "-1"]);
    assert.notEqual(result.code, 0);
    assert.match(result.out, /--to must be a non-negative integer revision/);
  });
});

test("CLI revert --to rejects a non-integer revision", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli(["revert", slug, "--to", "1.5"]);
    assert.notEqual(result.code, 0);
    assert.match(result.out, /--to must be a non-negative integer revision/);
  });
});

test("CLI revert --to 0 is accepted as a legitimate target when a rev-0 snapshot exists", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const original = await loadProject(slug);
    await runCli(["pad", slug, "10"]); // rev0 -> rev1, snapshot rev-0.json written
    const result = await runCli(["revert", slug, "--to", "0"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /revision 0/);
    const reverted = await loadProject(slug);
    assert.equal(reverted.padMs, original.padMs);
  });
});

test("CLI revert --task without force fails when a later unrelated edit would be discarded, --force proceeds", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    // The CLI's own runLoggedAction never threads a taskId (only agent/MCP
    // calls do, via OPENKLIP_TASK_ID -> toolTaskId() in src/agent-tools.ts),
    // so build the task-tagged history directly through mutateProject, the
    // same way tests/revert.test.ts does, and only exercise the CLI for the
    // revert command itself.
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 10;
      },
      { action: "pad", actor: "agent", taskId: "task-cli-1" }
    );
    await mutateProject(
      slug,
      (p) => {
        p.padMs = 20;
      },
      { action: "pad", actor: "human" }
    );

    const blocked = await runCli(["revert", slug, "--task", "task-cli-1"]);
    assert.notEqual(blocked.code, 0);
    assert.match(blocked.out, /force/);

    const forced = await runCli([
      "revert",
      slug,
      "--task",
      "task-cli-1",
      "--force",
    ]);
    assert.equal(forced.code, 0, forced.out);
  });
});

// ── CLI history: openklip history <slug> [--limit N] [--task <id>] [--action <name>] ──

test("CLI history prints action history newest-first with snapshot revisions", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    await runCli(["pad", slug, "10"]);
    await runCli(["pad", slug, "20"]);

    const result = await runCli(["history", slug]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /pad\s+rev 1->2\s+cli/);
    assert.match(result.out, /pad\s+rev 0->1\s+cli/);
    assert.match(result.out, /2 entries/);
    assert.match(result.out, /snapshot revisions: 0, 1/);
  });
});

test("CLI history with no logged actions reports an empty log", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli(["history", slug]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /no history for/);
  });
});

// ── CLI tasks: openklip tasks <slug> [--limit N] [--status <status>] ──────

test("CLI tasks prints agent task records newest-first", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetAgentTaskIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));
    const first = await createAgentTask(slug, { request: "First task" });
    const second = await createAgentTask(slug, { request: "Second task" });

    const result = await runCli(["tasks", slug]);
    assert.equal(result.code, 0, result.out);
    const firstLine = result.out.indexOf(first.id);
    const secondLine = result.out.indexOf(second.id);
    assert.ok(firstLine >= 0, result.out);
    assert.ok(secondLine >= 0, result.out);
    assert.ok(secondLine < firstLine, result.out);
    assert.match(result.out, /2 tasks/);
  });
});

test("CLI tasks with no tasks reports an empty list", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli(["tasks", slug]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /no tasks for/);
  });
});

// ── CLI captions-style: openklip captions-style <slug> <style> ──────────────

test("CLI captions-style sets project.captions.style and logs a captions-style entry", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli(["captions-style", slug, "karaoke"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /karaoke/);

    const project = await loadProject(slug);
    assert.equal(project.captions.style, "karaoke");

    const entries = await readActionLog(slug);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, "captions-style");
    assert.equal(entries[0].actor, "cli");
  });
});

test("CLI captions-style rejects an unknown style id with a usage error listing valid ids", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const result = await runCli(["captions-style", slug, "not-a-style"]);
    assert.notEqual(result.code, 0);
    assert.match(result.out, /boxed/);
    assert.match(result.out, /karaoke/);

    const entries = await readActionLog(slug);
    assert.equal(entries.length, 0);
  });
});
