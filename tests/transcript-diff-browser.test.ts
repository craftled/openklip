import assert from "node:assert/strict";
import { test } from "node:test";
import puppeteer from "puppeteer-core";
import { prepareIntegrationEditorFixture } from "./helpers/integration-editor-fixture.ts";
import { chromeAvailable } from "./helpers/integration-gate.ts";
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

async function ensureHistoryPanelReady(page: import("puppeteer-core").Page) {
  await page.waitForFunction(
    () => Boolean(document.querySelector('[aria-label="Toggle config"]')),
    { timeout: 30_000 }
  );
  await page.evaluate(() => {
    document.querySelector('[aria-label="Toggle config"]')?.click();
  });
  await page.waitForSelector("[data-config-tab-bar]", { timeout: 30_000 });
  await page.evaluate(() => {
    const historyTab = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "History"
    );
    historyTab?.click();
  });
  await page.waitForSelector("[data-history-entry-key]", { timeout: 90_000 });
}

async function openTranscriptDiffWithChanges(
  page: import("puppeteer-core").Page
) {
  const hostCount = await page.$$eval(
    "[data-history-transcript-diff]",
    (hosts) => hosts.length
  );

  for (let hostIndex = 0; hostIndex < hostCount; hostIndex++) {
    await page.evaluate((index) => {
      const host = document.querySelectorAll("[data-history-transcript-diff]")[
        index
      ];
      const button = host?.querySelector("button");
      button?.scrollIntoView({ block: "center" });
      button?.click();
    }, hostIndex);

    try {
      await page.waitForSelector("[data-transcript-diff-view]", {
        timeout: 15_000,
      });
      await page.waitForFunction(
        () => {
          const view = document.querySelector("[data-transcript-diff-view]");
          if (!view) {
            return false;
          }
          if (view.textContent?.includes("No kept-word changes in this edit")) {
            return false;
          }
          const host = document.querySelector("diffs-container");
          return (host?.shadowRoot?.textContent?.trim().length ?? 0) > 20;
        },
        { timeout: 15_000 }
      );
    } catch {
      await page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find((entry) =>
          entry.textContent?.includes("Hide transcript diff")
        );
        button?.click();
      });
      continue;
    }

    return await page.evaluate(() => {
      const view = document.querySelector("[data-transcript-diff-view]");
      const host = document.querySelector("diffs-container");
      return {
        emptyMessage: view?.textContent?.includes(
          "No kept-word changes in this edit"
        ),
        shadowLength: host?.shadowRoot?.textContent?.trim().length ?? 0,
      };
    });
  }

  return null;
}

test("editor History panel shows transcript diff for transcript actions", {
  skip: skipReason,
  timeout: 300_000,
}, async (t) => {
  const fixture = await prepareIntegrationEditorFixture();
  const server = await spawnIntegrationServer(fixture.projectsRoot);
  t.after(async () => {
    await server.stop();
    fixture.cleanup();
  });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });
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

    await ensureHistoryPanelReady(page);

    const state = await openTranscriptDiffWithChanges(page);
    assert.ok(state, "found a history entry with kept-word changes");

    await page.waitForFunction(
      () => {
        const host = document.querySelector("diffs-container");
        const shadowText = host?.shadowRoot?.textContent?.trim() ?? "";
        return shadowText.length > 20;
      },
      { timeout: 90_000 }
    );

    const metrics = await page.evaluate(() => {
      const view = document.querySelector("[data-transcript-diff-view]");
      const host = document.querySelector("diffs-container");
      const shadow = host?.shadowRoot;
      return {
        hasDiffView: Boolean(view),
        shadowLength: shadow?.textContent?.trim().length ?? 0,
        title: view?.querySelector("h3")?.textContent ?? "",
      };
    });

    assert.ok(metrics.hasDiffView, "transcript diff view mounted");
    assert.ok(metrics.shadowLength > 20, "diff content rendered");
    assert.match(metrics.title, /edit-words|cut|restore|word-text/);
  } finally {
    await browser.close();
  }
});
