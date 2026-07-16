import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "puppeteer-core";
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

// Same technique as golden-path-browser.test.ts: drive the native Selection
// API over a word's text node so the panel's selectionchange listener
// (syncSelection) resolves a real, non-collapsed range instead of the
// collapsed caret a raw click/double-click leaves behind under CDP.
async function selectWord(page: Page, index: number): Promise<void> {
  const selector = `[data-word-index="${index}"]`;
  await page.waitForSelector(selector, { timeout: 15_000 });
  await page.evaluate((idx: number) => {
    const el = document.querySelector(`[data-word-index="${idx}"]`);
    const textNode = el?.firstChild;
    if (!textNode) {
      throw new Error(`word ${idx} has no text node to select`);
    }
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, index);
  await page.waitForSelector("[data-transcript-selection-toolbar]", {
    timeout: 15_000,
  });
}

async function waitForWordDeleted(
  page: Page,
  index: number,
  deleted: boolean,
  timeout = 15_000
): Promise<void> {
  await page.waitForFunction(
    (idx: number, wantDeleted: boolean) => {
      const el = document.querySelector(`[data-word-index="${idx}"]`);
      if (!el) {
        return false;
      }
      const isDeleted = el.classList.contains("line-through");
      return isDeleted === wantDeleted;
    },
    { timeout },
    index,
    deleted
  );
}

async function fetchRevision(apiBase: string): Promise<number> {
  const res = await fetch(`${apiBase}/revision`);
  const data = (await res.json()) as { revision: number };
  return data.revision;
}

async function waitForRevision(
  page: Page,
  apiPath: string,
  target: number,
  timeout = 30_000
): Promise<void> {
  await page.waitForFunction(
    async (path: string, wanted: number) => {
      const res = await fetch(path);
      if (!res.ok) {
        return false;
      }
      const data = (await res.json()) as { revision: number };
      return data.revision === wanted;
    },
    { timeout },
    `${apiPath}`,
    target
  );
}

test("editor recovers from a failed optimistic save: persistent error + dirty indicator, then Retry persists the edit", {
  skip: skipReason,
  timeout: 180_000,
}, async (t) => {
  const fixture = await prepareIntegrationEditorFixture();
  const server = await spawnIntegrationServer(fixture.projectsRoot);
  t.after(async () => {
    await server.stop();
    fixture.cleanup();
  });

  const browser = await launchIntegrationBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });

    const slug = fixture.slug;
    const editorUrl = `${server.baseUrl}${slug}`;
    const apiBase = `${server.baseUrl}api/projects/${slug}`;

    // ── Deterministic failure injection: abort the FIRST (and only the
    // first) server-action POST to the editor's own URL, which is where
    // Next.js server actions (saveProjectEdits here) post to. Everything
    // else - including the retry's POST - is left to continue normally. ──
    let armFailure = false;
    let abortedOnce = false;
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (
        armFailure &&
        !abortedOnce &&
        req.method() === "POST" &&
        req.url() === editorUrl
      ) {
        abortedOnce = true;
        armFailure = false;
        req.abort("failed");
        return;
      }
      req.continue();
    });

    const response = await page.goto(editorUrl, {
      timeout: 90_000,
      waitUntil: "networkidle2",
    });
    assert.equal(response?.status(), 200);
    await page.waitForSelector('[aria-label="Transcript editor"]', {
      timeout: 60_000,
    });

    const revBefore = await fetchRevision(apiBase);

    // Word index 0 ("Hello") is kept by the fixture; cutting it is a
    // single, well-defined saveProjectEdits mutation.
    armFailure = true;
    await selectWord(page, 0);
    await page.click('[aria-label="Cut selected"]');

    // ── The optimistic edit applies immediately client-side... ──
    await waitForWordDeleted(page, 0, true);

    // ── ...but the save behind it was aborted, so a PERSISTENT error and
    // dirty indicator must appear - not a toast that fades on its own. ──
    await page.waitForSelector('[data-testid="save-recovery-banner"]', {
      timeout: 15_000,
    });
    assert.ok(abortedOnce, "the injected failure actually fired");

    const dirtyText = await page.$eval(
      '[data-testid="save-recovery-dirty-count"]',
      (el) => el.textContent ?? ""
    );
    assert.match(dirtyText, /failed to save/);

    // The banner must still be visible well after the failure (i.e. it is
    // not a transient toast that auto-dismisses).
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const stillVisible = await page.$('[data-testid="save-recovery-banner"]');
    assert.ok(stillVisible, "error banner persists, did not vanish");

    // Revision must NOT have advanced: the failed save never reached the
    // server.
    assert.equal(await fetchRevision(apiBase), revBefore);

    // ── Retry: re-attempts the failed mutation and persists it exactly
    // once (no interception armed this time, so it goes through). ──
    await page.click('[data-testid="save-recovery-retry"]');

    await waitForRevision(
      page,
      `/api/projects/${slug}/revision`,
      revBefore + 1
    );
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="save-recovery-banner"]'),
      { timeout: 15_000 }
    );

    // The retried edit persisted (not double-applied - a single cut of a
    // single word yields exactly one revision step).
    assert.equal(await fetchRevision(apiBase), revBefore + 1);
    await waitForWordDeleted(page, 0, true);

    const historyRes = await fetch(`${apiBase}/history`);
    const history = (await historyRes.json()) as {
      entries: Array<{ action: string; revisionAfter: number }>;
    };
    const newest = history.entries[0];
    assert.ok(newest, "history has an entry for the retried save");
    assert.equal(newest.revisionAfter, revBefore + 1);
  } finally {
    await browser.close();
  }
});
