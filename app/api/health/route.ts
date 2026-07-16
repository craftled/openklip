import { readFileSync } from "node:fs";
import { repoPath } from "@engine/repo-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readVersion(): string {
  try {
    return readFileSync(repoPath("VERSION"), "utf-8").trim();
  } catch {
    return "unknown";
  }
}

export function GET(): Response {
  return Response.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: readVersion(),
    },
    {
      headers: { "cache-control": "no-store" },
    }
  );
}
