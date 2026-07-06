import assert from "node:assert/strict";
import { test } from "node:test";
import puppeteer from "puppeteer-core";
import { chromeAvailable } from "./helpers/integration-gate.ts";
import { prepareIntegrationEditorFixture } from "./helpers/integration-editor-fixture.ts";
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

test("mobile viewport exposes chat and config overlay toggles", {
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
  t.after(async () => {
    await browser.close();
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  const editorUrl = `${server.baseUrl}${fixture.slug}`;
  const response = await page.goto(editorUrl, {
    waitUntil: "networkidle2",
    timeout: 90_000,
  });
  assert.equal(response?.status(), 200);

  await page.waitForSelector('[aria-label="Open chat"]', { timeout: 30_000 });
  await page.waitForSelector('[aria-label="Open config"]', {
    timeout: 30_000,
  });

  await page.click('[aria-label="Open config"]');
  await page.waitForSelector("[data-config-tab-bar]", { timeout: 30_000 });

  await page.click('[aria-label="Open chat"]');
  await page.waitForSelector("[data-mobile-right-rail]", { timeout: 30_000 });
  const railLabel = await page.$eval(
    "[data-mobile-right-rail]",
    (el) => el.getAttribute("aria-label") ?? ""
  );
  assert.equal(railLabel, "Chat");
});
