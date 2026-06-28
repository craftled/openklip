import { existsSync } from "node:fs";
import { projectPaths } from "./paths.ts";

// Re-ingesting a slug wipes the whole project dir. This guard refuses unless
// the caller explicitly opts in with force. Extracted to its own module so it
// can be unit-tested without spinning up ffmpeg/whisper and without being
// affected by `mock.module("@engine/ingest", ...)` in the route tests (Bun
// module mocks are not restored by mock.restore()).
export function assertProjectCanBeIngested(
  slug: string,
  force?: boolean
): void {
  if (!force && existsSync(projectPaths(slug).project)) {
    throw new Error(
      `project already exists: ${slug} (re-ingest would wipe it; pass --force to overwrite)`
    );
  }
}
