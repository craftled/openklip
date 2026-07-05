import { existsSync } from "node:fs";

const DEFAULT_CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export function chromeAvailable(
  chromePath = process.env.OPENKLIP_CHROME_PATH ?? DEFAULT_CHROME_PATH
): boolean {
  return existsSync(chromePath);
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
