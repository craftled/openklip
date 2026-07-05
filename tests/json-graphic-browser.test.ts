import assert from "node:assert/strict";
import { test } from "node:test";
import puppeteer from "puppeteer-core";
import { chromeAvailable } from "./helpers/integration-gate.ts";
import { prepareIntegrationJsonGraphicFixture } from "./helpers/integration-json-graphic-fixture.ts";
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

async function openTimelineDrawer(page: import("puppeteer-core").Page) {
  await page.waitForFunction(
    () => Boolean(document.querySelector('[aria-label="Toggle config"]')),
    { timeout: 30_000 }
  );
  await page.evaluate(() => {
    document.querySelector('[aria-label="Toggle config"]')?.click();
  });
  await page.waitForSelector("[data-config-tab-bar]", { timeout: 30_000 });
  await page.evaluate(() => {
    const toolsTab = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Tools"
    );
    toolsTab?.click();
  });
  await page.evaluate(() => {
    const timelineButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Timeline"
    );
    timelineButton?.click();
  });
}

test("editor selects json-render graphic on timeline and shows inspector", {
  skip: skipReason,
  timeout: 300_000,
}, async (t) => {
  const fixture = await prepareIntegrationJsonGraphicFixture();
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

    await openTimelineDrawer(page);

    await page.waitForSelector(`[title="${fixture.graphicLabel}"]`, {
      timeout: 30_000,
    });
    await page.evaluate((label) => {
      const clip = document.querySelector(`[title="${label}"]`) as
        | HTMLElement
        | null;
      if (!clip) {
        return;
      }
      clip.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 })
      );
      clip.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, pointerId: 1 })
      );
    }, fixture.graphicLabel);

    await page.keyboard.press("Escape");

    await page.evaluate(() => {
      const configOpen = document.querySelector("[data-config-panel]");
      if (!configOpen) {
        document.querySelector('[aria-label="Toggle config"]')?.click();
      }
      const editTab = [...document.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Edit"
      );
      editTab?.click();
    });

    await page.waitForFunction(
      () => {
        const panel = document.querySelector("[data-config-panel]");
        return panel?.textContent?.includes("JSON graphic") ?? false;
      },
      { timeout: 15_000 }
    );

    const inspector = await page.evaluate(() => {
      const panel = document.querySelector("[data-config-panel]");
      return panel?.textContent?.includes("JSON graphic") ?? false;
    });
    assert.equal(inspector, true, "json-render graphic inspector visible");

    await openTimelineDrawer(page);
    const trimmed = await page.evaluate((label) => {
      const clipEl = document.querySelector(`[title="${label}"]`);
      const handle = clipEl?.querySelector('[data-handle="end"]') as
        | HTMLElement
        | null;
      if (!(clipEl && handle)) {
        return false;
      }
      const rect = handle.getBoundingClientRect();
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: startX,
          clientY: startY,
          pointerId: 1,
        })
      );
      document.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: startX + 48,
          clientY: startY,
          pointerId: 1,
        })
      );
      document.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: startX + 48,
          clientY: startY,
          pointerId: 1,
        })
      );
      return true;
    }, fixture.graphicLabel);
    assert.equal(trimmed, true, "trim handle interaction dispatched");
  } finally {
    await browser.close();
  }
});
