import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { test } from "node:test";
import type { Page } from "puppeteer-core";
import { ingestJobsStorePath } from "../src/paths.ts";
import { prepareIntegrationEditorFixture } from "./helpers/integration-editor-fixture.ts";
import {
  chromeAvailable,
  launchIntegrationBrowser,
} from "./helpers/integration-gate.ts";
import { spawnIntegrationServer } from "./helpers/integration-server.ts";

const CHROME_PATH =
  process.env.OPENKLIP_CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function integrationSkipReason(): string | false {
  if (process.env.OPENKLIP_INTEGRATION !== "1") {
    return "Set OPENKLIP_INTEGRATION=1 to run browser integration tests";
  }
  if (!chromeAvailable(CHROME_PATH)) {
    return "Chrome not installed (set OPENKLIP_CHROME_PATH to override)";
  }
  return false;
}

const skipReason = integrationSkipReason();

const INTERRUPTED_JOB_ID = "orphan-interrupted-1";
const ERROR_JOB_ID = "orphan-error-1";

// Seed the workspace-level ingest jobs store directly (bypassing the
// write-through path entirely, same technique as
// tests/ingest-jobs.test.ts's orphan-record test): one "interrupted" job
// whose sourcePath points nowhere (retry must refuse honestly, not crash),
// and one "error" job (Clean up must remove it). Must run while
// OPENKLIP_PROJECTS_ROOT is set to the fixture's root (prepareIntegration-
// EditorFixture sets it) so ingestJobsStorePath() resolves into the temp
// workspace the integration server is about to boot against.
function seedIngestJobsStore(): void {
  const now = Date.now();
  const storePath = ingestJobsStorePath();
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(
    storePath,
    JSON.stringify({
      jobs: [
        {
          id: INTERRUPTED_JOB_ID,
          filename: "clip.mp4",
          slug: "gone-slug",
          sourcePath: "/nonexistent/clip.mp4",
          status: "interrupted",
          error: "Server restarted while ingest was running",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: ERROR_JOB_ID,
          filename: "broken.mp4",
          slug: "broken-slug",
          status: "error",
          error: "ffmpeg exploded",
          createdAt: now,
          updatedAt: now,
        },
      ],
    })
  );
}

async function openJobsTab(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean(document.querySelector('[data-sidebar-segment="config"]')),
    { timeout: 30_000 }
  );
  await page.evaluate(() => {
    document
      .querySelector('[data-sidebar-segment="config"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForSelector("[data-config-tab-bar]", { timeout: 30_000 });
  await page.evaluate(() => {
    const jobsTab = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Jobs"
    );
    jobsTab?.click();
  });
  await page.waitForSelector("[data-jobs-panel]", { timeout: 30_000 });
}

test("Job Center: renders seeded jobs, honestly refuses a dead-source retry, and cleans up a terminal record", {
  skip: skipReason,
  timeout: 180_000,
}, async (t) => {
  const fixture = await prepareIntegrationEditorFixture();
  seedIngestJobsStore();
  const server = await spawnIntegrationServer(fixture.projectsRoot);
  t.after(async () => {
    await server.stop();
    fixture.cleanup();
  });

  const browser = await launchIntegrationBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });

    const editorUrl = `${server.baseUrl}${fixture.slug}`;
    const response = await page.goto(editorUrl, {
      timeout: 90_000,
      waitUntil: "networkidle2",
    });
    assert.equal(response?.status(), 200);
    await page.waitForSelector('[aria-label="Transcript editor"]', {
      timeout: 60_000,
    });

    await openJobsTab(page);

    // Both seeded rows render with their status badges.
    await page.waitForFunction(
      () => Boolean(document.querySelector('[data-job-status="interrupted"]')),
      { timeout: 30_000 }
    );
    const rowCount = await page.$$eval("[data-job-row]", (rows) => rows.length);
    assert.ok(rowCount >= 2, `expected at least 2 job rows, saw ${rowCount}`);

    const errorBadgeCount = await page.$$eval(
      '[data-job-status="error"]',
      (rows) => rows.length
    );
    assert.equal(errorBadgeCount, 1);

    // Retry the interrupted job: the source is gone, so this must surface
    // an honest refusal toast, not a silent failure or a crash.
    await page.evaluate(() => {
      const row = [...document.querySelectorAll("[data-job-row]")].find((el) =>
        el.querySelector('[data-job-status="interrupted"]')
      );
      const retryButton =
        row?.querySelector<HTMLButtonElement>("[data-job-retry]");
      retryButton?.click();
    });
    await page.waitForFunction(
      () =>
        document.body.textContent?.includes(
          "original source no longer available"
        ) ?? false,
      { timeout: 20_000 }
    );

    // Arm + confirm Clean up on the error job; its row disappears.
    await page.evaluate(() => {
      const row = [...document.querySelectorAll("[data-job-row]")].find((el) =>
        el.querySelector('[data-job-status="error"]')
      );
      const cleanupButton =
        row?.querySelector<HTMLButtonElement>("[data-job-cleanup]");
      cleanupButton?.click();
    });
    await page.waitForSelector("[data-job-cleanup-confirm]", {
      timeout: 10_000,
    });
    await page.evaluate(() => {
      document
        .querySelector<HTMLButtonElement>("[data-job-cleanup-confirm]")
        ?.click();
    });
    await page.waitForFunction(
      () => !document.querySelector('[data-job-status="error"]'),
      { timeout: 20_000 }
    );

    const remainingErrorRows = await page.$$eval(
      '[data-job-status="error"]',
      (rows) => rows.length
    );
    assert.equal(remainingErrorRows, 0);
  } finally {
    await browser.close();
  }
});
