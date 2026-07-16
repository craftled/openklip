import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import type { Page } from "puppeteer-core";
import type { Project } from "../src/edl.ts";
import { probe } from "../src/ffmpeg.ts";
import { projectPaths } from "../src/paths.ts";
import {
  chromeAvailable,
  launchIntegrationBrowser,
} from "./helpers/integration-gate.ts";
import {
  GOLDEN_PATH_FFMPEG_OK,
  prepareIntegrationGoldenFixture,
} from "./helpers/integration-golden-fixture.ts";
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
  if (!GOLDEN_PATH_FFMPEG_OK) {
    return "ffmpeg binary unavailable";
  }
  return false;
}

const skipReason = integrationSkipReason();

// Console noise this journey tolerates without failing: a favicon 404 (no
// favicon asset is registered for the temp project's editor route) is the
// only benign same-origin 4xx besides the ONE intentional 400 triggered in
// step 8 (see captureFailures below).
function isBenignFailedResponse(url: string, status: number): boolean {
  return status === 404 && url.endsWith("/favicon.ico");
}

// Next.js Server Actions (saveProjectEdits, exportProject) POST to the
// current page URL. Firing several in quick succession (cut, then restore,
// then re-cut, each awaited only until the SERVER'S revision advances, not
// until the client-side fetch object itself fully settles) can leave a
// still-draining previous action response superseded and aborted by the
// next one; Chrome reports that as a `requestfailed` event with
// resourceType "fetch" and net::ERR_ABORTED, even though the mutation it
// carried already committed (this journey independently confirms that via
// the revision poll before moving on). This is standard fetch-supersession
// behavior, not a broken request, so it is excluded here; any other failure
// reason (connection refused, DNS, timeout, etc.) still fails the test.
function isBenignFailedRequest(
  url: string,
  editorUrl: string,
  resourceType: string,
  errorText: string | undefined
): boolean {
  return (
    url === editorUrl &&
    resourceType === "fetch" &&
    errorText === "net::ERR_ABORTED"
  );
}

function sameOrigin(url: string, baseUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

async function waitForRevision(
  page: Page,
  slug: string,
  target: number,
  timeout = 30_000
): Promise<void> {
  await page.waitForFunction(
    async (apiPath: string, wanted: number) => {
      const res = await fetch(apiPath);
      if (!res.ok) {
        return false;
      }
      const data = (await res.json()) as { revision: number };
      return data.revision === wanted;
    },
    { timeout },
    `/api/projects/${slug}/revision`,
    target
  );
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

// Selects one transcript word by driving the browser's native Selection API
// over its text node (range.selectNodeContents + Selection.addRange), which
// is the same mechanism the panel's own selectionchange listener
// (syncSelection -> readNativeWordRange in editor-transcript-panel.tsx)
// converts into a [index, index] selection range.
//
// A raw double-click (mousedown detail===2) was tried first per the brief
// and found NOT reliably selectable via CDP: the panel places a native
// collapsed caret as the FIRST click's default action, and the SECOND
// click's preventDefault only cancels ITS OWN default (word-expand) action,
// leaving the native selection collapsed. The panel's selectionchange
// listener then fires (asynchronously, after the manual onSelect handler's
// state update) and calls onSelectRange(null) because a collapsed selection
// resolves to a null range, wiping out the just-set selection. This raced
// deterministically across repeated headless runs regardless of click
// timing. Driving the Selection API directly produces a genuinely
// non-collapsed native range, so syncSelection resolves it to the intended
// word index instead of clearing it, matching the drag-select interaction a
// real user would also use to reach the same code path.
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

test("golden path: navigate, cut, restore, re-cut, reload, export, controlled failure", {
  skip: skipReason,
  timeout: 300_000,
}, async (t) => {
  const fixture = await prepareIntegrationGoldenFixture();
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

    // ── Step 2: install error/console/network capture BEFORE navigation ──
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const hydrationErrors: string[] = [];
    const failedRequests: string[] = [];
    const failedResponses: string[] = [];
    let captureFailures = true;

    page.on("pageerror", (err) => {
      pageErrors.push(err.message ?? String(err));
    });
    page.on("console", (msg) => {
      if (!captureFailures) {
        return;
      }
      if (msg.type() !== "error") {
        return;
      }
      const text = msg.text();
      consoleErrors.push(text);
      if (
        /hydrat/i.test(text) ||
        text.includes("Text content does not match")
      ) {
        hydrationErrors.push(text);
      }
    });
    page.on("requestfailed", (req) => {
      if (!captureFailures) {
        return;
      }
      if (!sameOrigin(req.url(), server.baseUrl)) {
        return;
      }
      if (
        isBenignFailedRequest(
          req.url(),
          editorUrl,
          req.resourceType(),
          req.failure()?.errorText
        )
      ) {
        return;
      }
      failedRequests.push(
        `${req.url()} (${req.failure()?.errorText ?? "unknown"})`
      );
    });
    page.on("response", (res) => {
      if (!captureFailures) {
        return;
      }
      const status = res.status();
      const url = res.url();
      if (status < 400 || !sameOrigin(url, server.baseUrl)) {
        return;
      }
      if (isBenignFailedResponse(url, status)) {
        return;
      }
      failedResponses.push(`${url} -> ${status}`);
    });

    // ── Step 1: navigate and confirm the editor mounted ──
    const response = await page.goto(editorUrl, {
      timeout: 90_000,
      waitUntil: "networkidle2",
    });
    assert.equal(response?.status(), 200);
    await page.waitForSelector('[aria-label="Transcript editor"]', {
      timeout: 60_000,
    });

    // ── Step 3: cut word index 1 and confirm server-side persistence ──
    const revBeforeRes = await fetch(`${apiBase}/revision`);
    const revBeforeJson = (await revBeforeRes.json()) as {
      revision: number;
    };
    const revBefore = revBeforeJson.revision;

    await selectWord(page, 1);
    await page.click('[aria-label="Cut selected"]');
    await waitForWordDeleted(page, 1, true);
    await waitForRevision(page, slug, revBefore + 1);

    // ── Step 4: history persisted the transcript edit ──
    const historyAfterCutRes = await fetch(`${apiBase}/history`);
    const historyAfterCut = (await historyAfterCutRes.json()) as {
      entries: Array<{ action: string; revisionAfter: number }>;
    };
    const newestAfterCut = historyAfterCut.entries[0];
    assert.ok(newestAfterCut, "history has at least one entry after cut");
    assert.equal(newestAfterCut.revisionAfter, revBefore + 1);
    assert.match(newestAfterCut.action, /edit-words|cut|restore|word-text/);

    // ── Step 5: restore, then re-cut so the reload check has a
    // persistently-cut word ──
    await selectWord(page, 1);
    await page.click('[aria-label="Restore selected"]');
    await waitForWordDeleted(page, 1, false);
    await waitForRevision(page, slug, revBefore + 2);

    await selectWord(page, 1);
    await page.click('[aria-label="Cut selected"]');
    await waitForWordDeleted(page, 1, true);
    await waitForRevision(page, slug, revBefore + 3);

    // ── Step 6: reload and confirm the cut survived on disk ──
    const reloadResponse = await page.goto(editorUrl, {
      timeout: 90_000,
      waitUntil: "networkidle2",
    });
    assert.equal(reloadResponse?.status(), 200);
    await page.waitForSelector('[aria-label="Transcript editor"]', {
      timeout: 60_000,
    });
    await waitForWordDeleted(page, 1, true);

    const projectOnDisk = JSON.parse(
      readFileSync(projectPaths(slug).project, "utf8")
    ) as Project;
    const persistedWord = projectOnDisk.words.find((w) => w.id === "w1");
    assert.ok(persistedWord, "cut word still present in project.json");
    assert.equal(persistedWord?.deleted, true);

    // ── Step 7: export and structurally verify the output (no Whisper) ──
    await page.waitForSelector('[data-testid="export-open"]', {
      timeout: 15_000,
    });
    await page.click('[data-testid="export-open"]');
    await page.waitForSelector('[data-testid="export-confirm"]', {
      timeout: 15_000,
    });
    await page.click('[data-testid="export-confirm"]');

    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".cn-toast")].some((toastEl) =>
          (toastEl.textContent ?? "").includes("Export complete")
        ),
      { timeout: 120_000 }
    );

    const outPath = projectPaths(slug).out;
    assert.ok(existsSync(outPath), "output/out.mp4 exists on disk");
    const outStat = statSync(outPath);
    assert.ok(outStat.size > 1000, "output file is non-trivial in size");

    const probed = await probe(outPath);
    assert.ok(probed.durationSec > 0, "exported file has a valid duration");
    assert.ok(
      probed.width > 0 && probed.height > 0,
      "exported file has a valid video stream"
    );

    // ── Step 8: controlled failure via a deterministic invalid export
    // request (fps out of the server's 1..120 bound). This is a real
    // client-visible 4xx, so it is excluded (via the captureFailures
    // toggle) from the failed-request/-response collectors AND the
    // console-error collector: Chrome itself logs a "Failed to load
    // resource: the server responded with a status of 400" devtools
    // message for any non-2xx response, independent of app code, so it
    // must be paused too or step 9 would see it as an unexplained
    // console error. ──
    captureFailures = false;
    const controlledFailure = await page.evaluate(async (projectSlug) => {
      const res = await fetch(`/api/projects/${projectSlug}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fps: 121 }),
      });
      return { status: res.status, text: await res.text() };
    }, slug);
    captureFailures = true;

    assert.ok(
      controlledFailure.status >= 400 && controlledFailure.status < 500,
      `expected a 4xx for fps=121, got ${controlledFailure.status}`
    );
    assert.match(controlledFailure.text, /fps/i);
    assert.match(controlledFailure.text, /120/);

    // App stays functional after the controlled failure.
    await page.waitForSelector('[aria-label="Transcript editor"]', {
      timeout: 5000,
    });
    await waitForWordDeleted(page, 1, true);

    // ── Step 9: no unexpected errors, console errors, hydration
    // mismatches, failed requests, or failed responses across the whole
    // journey (the intentional step-8 400 and favicon 404 are excluded
    // above). ──
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(hydrationErrors, []);
    assert.deepEqual(failedRequests, []);
    assert.deepEqual(failedResponses, []);
    assert.deepEqual(consoleErrors, []);
  } finally {
    await browser.close();
  }
});
