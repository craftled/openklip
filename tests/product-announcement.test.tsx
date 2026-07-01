import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectSchema, SAMPLE_RATE } from "../src/edl.ts";
import {
  PRODUCT_ANNOUNCEMENT_CATALOG,
  PRODUCT_ANNOUNCEMENT_LIMITS,
  sampleProductAnnouncementSpec,
  validateProductAnnouncementSpec,
} from "../src/product-announcement.ts";
import { renderProductAnnouncementHtml } from "../src/product-announcement-html.tsx";
import { actionManifest, actionTable, runAction } from "../src/registry.ts";
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
  invalidAccent.elements.hero.props = {
    ...invalidAccent.elements.hero.props,
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
    assert.match(invalidComponent.out, /invalid product announcement spec/);

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
