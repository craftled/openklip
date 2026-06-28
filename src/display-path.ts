import { homedir } from "node:os";

export function formatDisplayPath(absPath: string): string {
  const home = homedir();
  if (absPath === home) {
    return "~";
  }
  if (absPath.startsWith(`${home}/`)) {
    return `~${absPath.slice(home.length)}`;
  }
  return absPath;
}
