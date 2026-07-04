import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import puppeteer from "puppeteer-core";

const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROD_EDITOR_URL = "http://localhost:4399/edgaras-raw";

function chromeAvailable(): boolean {
  return existsSync(CHROME_PATH);
}

async function serverAvailable(): Promise<boolean> {
  try {
    const res = await fetch(PROD_EDITOR_URL, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureHistoryPanelReady(page: import("puppeteer-core").Page) {
  await page.waitForFunction(
    () => Boolean(document.querySelector('[aria-label="Toggle config"]')),
    { timeout: 30_000 }
  );
  await page.evaluate(() => {
    document.querySelector('[aria-label="Toggle config"]')?.click();
  });
  await page.waitForSelector("[data-history-entry-key]", { timeout: 90_000 });
}

async function openTranscriptDiffWithChanges(
  page: import("puppeteer-core").Page
) {
  const toggles = await page.$$eval("button", (buttons) =>
    buttons
      .map((button, index) => ({
        index,
        label: button.textContent?.trim() ?? "",
      }))
      .filter((button) => button.label === "Show transcript diff")
      .map((button) => button.index)
  );

  for (const index of toggles) {
    await page.evaluate((buttonIndex) => {
      const button = [...document.querySelectorAll("button")][buttonIndex];
      button?.scrollIntoView({ block: "center" });
      button?.click();
    }, index);

    await page.waitForSelector("[data-transcript-diff-view]", {
      timeout: 15_000,
    });

    const state = await page.evaluate(() => {
      const view = document.querySelector("[data-transcript-diff-view]");
      const host = document.querySelector("diffs-container");
      const shadowText = host?.shadowRoot?.textContent?.trim() ?? "";
      return {
        emptyMessage: view?.textContent?.includes(
          "No kept-word changes in this edit"
        ),
        shadowLength: shadowText.length,
      };
    });

    if (state.shadowLength > 20) {
      return state;
    }

    if (state.emptyMessage) {
      await page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find((entry) =>
          entry.textContent?.includes("Hide transcript diff")
        );
        button?.click();
      });
    }
  }

  return null;
}

test("editor History panel shows transcript diff for transcript actions", {
  skip: chromeAvailable()
    ? (await serverAvailable())
      ? false
      : "Dev server not running on :4399"
    : "Chrome not installed",
  timeout: 180_000,
}, async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    const response = await page.goto(PROD_EDITOR_URL, {
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
