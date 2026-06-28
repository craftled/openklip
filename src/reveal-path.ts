import { execFile } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function revealCommand(targetPath: string): {
  args: string[];
  command: string;
} {
  const os = platform();
  if (os === "darwin") {
    return { command: "/usr/bin/open", args: [targetPath] };
  }
  if (os === "win32") {
    return { command: "explorer", args: [targetPath] };
  }
  return { command: "xdg-open", args: [targetPath] };
}

export async function revealInFileManager(targetPath: string): Promise<void> {
  if (process.env.OPENKLIP_TEST_REVEAL === "1") {
    return;
  }
  const { command, args } = revealCommand(targetPath);
  await execFileAsync(command, args, {
    env: process.env,
  });
}
