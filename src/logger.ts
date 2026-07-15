import pino, { type DestinationStream } from "pino";

type LogDestination = DestinationStream | NodeJS.WritableStream;

export function createLogger(destination?: LogDestination) {
  return pino(
    { level: process.env.OPENKLIP_LOG_LEVEL ?? "info" },
    destination ?? pino.destination(2)
  );
}

export const logger = createLogger();
