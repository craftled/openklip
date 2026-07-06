/** Thrown when ingest succeeds but copying the upload to a durable source path fails. */
export class IngestPersistError extends Error {
  readonly slug: string;

  constructor(slug: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `Project "${slug}" was created but saving the original source failed (${detail}). The editor works; exports fall back to the 720p proxy until you copy the source into the project folder or re-ingest.`
    );
    this.name = "IngestPersistError";
    this.slug = slug;
  }
}

export function isIngestPersistError(error: unknown): error is IngestPersistError {
  return error instanceof IngestPersistError;
}
