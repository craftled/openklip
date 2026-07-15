import pino, { type DestinationStream } from "pino";

type LogDestination = DestinationStream | NodeJS.WritableStream;

const DEFAULT_LOG_LEVEL = "info";

/** Pino levels accepted for OPENKLIP_LOG_LEVEL (empty/unknown → info). */
const LOG_LEVELS = new Set([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
]);

export function resolveLogLevel(
  raw: string | undefined = process.env.OPENKLIP_LOG_LEVEL
): string {
  const level = raw?.trim().toLowerCase();
  if (!(level && LOG_LEVELS.has(level))) {
    return DEFAULT_LOG_LEVEL;
  }
  return level;
}

export function createLogger(destination?: LogDestination) {
  return pino({ level: resolveLogLevel() }, destination ?? pino.destination(2));
}

export const logger = createLogger();
