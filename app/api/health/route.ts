import { readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readVersion(): string {
  try {
    return readFileSync(join(process.cwd(), "VERSION"), "utf-8").trim();
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
