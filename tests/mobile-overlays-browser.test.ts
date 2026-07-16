import assert from "node:assert/strict";
import { test } from "node:test";
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

  const browser = await launchIntegrationBrowser();
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

  // Open Config: reveals the left sidebar as a mobile dialog with the
  // config tabs visible.
  await page.click('[aria-label="Open config"]');
  await page.waitForSelector("[data-config-tab-bar]", { timeout: 30_000 });

  const configDialog = await page.waitForSelector(
    '[data-slot="sidebar"][role="dialog"]',
    { timeout: 30_000 }
  );
  assert.ok(configDialog, "config overlay renders a dialog role element");
  const configDialogName = await page.$eval(
    '[data-slot="sidebar"][role="dialog"]',
    (el) => {
      const labelledBy = el.getAttribute("aria-labelledby");
      const label = labelledBy
        ? document.getElementById(labelledBy)?.textContent?.trim()
        : null;
      return label ?? null;
    }
  );
  assert.equal(configDialogName, "Sidebar");

  // Switch a Config tab; confirm the panel reflects the new active tab.
  await page.evaluate(() => {
    const editTab = [
      ...document.querySelectorAll("[data-config-tab-bar] button"),
    ].find((button) => button.textContent?.trim() === "Edit");
    (editTab as HTMLButtonElement | undefined)?.click();
  });
  await page.waitForFunction(
    () => {
      const editTab = [
        ...document.querySelectorAll("[data-config-tab-bar] button"),
      ].find((button) => button.textContent?.trim() === "Edit");
      return editTab?.getAttribute("aria-pressed") === "true";
    },
    { timeout: 30_000 }
  );

  // Dismiss via Escape; the config overlay unmounts.
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => !document.querySelector("[data-config-tab-bar]"),
    { timeout: 30_000 }
  );

  // Open Chat still works after the config overlay closes.
  await page.click('[aria-label="Open chat"]');
  await page.waitForSelector("[data-mobile-right-rail]", { timeout: 30_000 });
  const chatDialog = await page.$eval(
    "[data-mobile-right-rail] section",
    (el) => ({
      ariaLabel: el.getAttribute("aria-label"),
      ariaModal: el.getAttribute("aria-modal"),
      role: el.getAttribute("role"),
    })
  );
  assert.deepEqual(chatDialog, {
    ariaLabel: "Chat",
    ariaModal: "true",
    role: "dialog",
  });

  // Dismiss the chat overlay via its backdrop. The backdrop button spans the
  // full overlay but the panel itself covers most of it visually, so
  // dispatch the click directly rather than relying on hit-testing a point.
  await page.evaluate(() => {
    document
      .querySelector('[data-mobile-right-rail] [aria-label="Close panel"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForFunction(
    () => !document.querySelector("[data-mobile-right-rail]"),
    { timeout: 30_000 }
  );
});
