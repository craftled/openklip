import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export type SourceMediaKind = "original" | "proxy" | "missing";

export interface SourceMediaStatus {
  kind: SourceMediaKind;
  path: string;
  /** Set when exports fall back to proxy or media is missing. */
  warn?: string;
}

function projectRelativePath(projectDir: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : join(projectDir, filePath);
}

/** Resolve which video file ingest/export will read (original vs 720p proxy). */
export function resolveSourceMediaStatus(input: {
  dir: string;
  proxy: string;
  source: string;
}): SourceMediaStatus {
  if (existsSync(input.source)) {
    return { kind: "original", path: input.source };
  }
  const proxyPath = projectRelativePath(input.dir, input.proxy);
  if (existsSync(proxyPath)) {
    return {
      kind: "proxy",
      path: proxyPath,
      warn: `Original source missing (${input.source}); exports use the 720p proxy (${proxyPath}). Restore the source or re-ingest for full quality.`,
    };
  }
  return {
    kind: "missing",
    path: input.source,
    warn: `No source or proxy video found (source: ${input.source}, proxy: ${proxyPath}). Export will fail until media is restored.`,
  };
}

export function proxyExportWarningMessage(
  status: SourceMediaStatus
): string | null {
  return status.kind === "proxy" ? (status.warn ?? null) : null;
}
