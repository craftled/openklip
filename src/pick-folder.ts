import { execFile } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function pickFolder(prompt: string): Promise<string | null> {
  if (process.env.OPENKLIP_TEST_PICK === "1") {
    const testPath = process.env.OPENKLIP_TEST_PICK_PATH;
    return testPath ? testPath : null;
  }

  if (platform() !== "darwin") {
    throw new Error("Folder picker is only supported on macOS");
  }

  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", [
      "-e",
      `POSIX path of (choose folder with prompt "${escapeAppleScriptString(prompt)}")`,
    ]);
    const picked = stdout.trim();
    return picked || null;
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    if (/user canceled|user cancelled|-128/i.test(message)) {
      return null;
    }
    throw e;
  }
}
