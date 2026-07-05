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
 * Browser integration tests are opt-in so `bun test` stays fast and reliable
 * without a dev server. Set OPENKLIP_INTEGRATION=1 and run the dev server first.
 */
export async function browserIntegrationSkipReason(input: {
  chromePath?: string;
  serverUrl: string;
}): Promise<string | false> {
  if (process.env.OPENKLIP_INTEGRATION !== "1") {
    return "Set OPENKLIP_INTEGRATION=1 to run browser integration tests";
  }
  const chromePath =
    input.chromePath ?? process.env.OPENKLIP_CHROME_PATH ?? DEFAULT_CHROME_PATH;
  if (!chromeAvailable(chromePath)) {
    return "Chrome not installed (set OPENKLIP_CHROME_PATH to override)";
  }
  if (!(await devServerAvailable(input.serverUrl))) {
    return `Dev server not running at ${input.serverUrl}`;
  }
  return false;
}
