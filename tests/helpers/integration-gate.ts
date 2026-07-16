import { existsSync } from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";

const DEFAULT_CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export function chromeAvailable(
  chromePath = process.env.OPENKLIP_CHROME_PATH ?? DEFAULT_CHROME_PATH
): boolean {
  return existsSync(chromePath);
}

// Single launch path for every browser integration test so CI-launch flags
// stay consistent. GitHub Actions Linux runs as root with no usable sandbox
// and a small /dev/shm; without these flags Chromium dies immediately with
// "Failed to launch the browser process". The flags are harmless on
// macOS/local, so the same launch works everywhere.
export function launchIntegrationBrowser(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: process.env.OPENKLIP_CHROME_PATH ?? DEFAULT_CHROME_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
}

export async function devServerAvailable(
  url: string,
  timeoutMs = 5000
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Browser integration tests are opt-in (`OPENKLIP_INTEGRATION=1`) so default
 * `bun test` stays fast. When enabled, transcript-diff-browser.test.ts
 * bootstraps its own fixture project and dev server on a free port.
 */
export function browserIntegrationSkipReason(input: {
  chromePath?: string;
  serverUrl: string;
}): string | false {
  if (process.env.OPENKLIP_INTEGRATION !== "1") {
    return "Set OPENKLIP_INTEGRATION=1 to run browser integration tests";
  }
  const chromePath =
    input.chromePath ?? process.env.OPENKLIP_CHROME_PATH ?? DEFAULT_CHROME_PATH;
  if (!chromeAvailable(chromePath)) {
    return "Chrome not installed (set OPENKLIP_CHROME_PATH to override)";
  }
  return false;
}
