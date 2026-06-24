#!/usr/bin/env bun
import { exportCut } from "./exporter.ts";
import { ingest } from "./ingest.ts";
import { serve } from "./server.ts";

const [cmd, ...rest] = process.argv.slice(2);

function help(): void {
  console.log(`openklip — edit video by editing text

  openklip ingest <video>    transcribe + build a project
  openklip serve [slug]      open the local editor (default: latest project)
  openklip export <slug>     render the current cut to out.mp4
`);
}

try {
  switch (cmd) {
    case "ingest":
      if (!rest[0]) throw new Error("usage: openklip ingest <video>");
      await ingest(rest[0]);
      break;
    case "serve":
    case "dev":
      await serve(rest[0]);
      break;
    case "export": {
      if (!rest[0]) throw new Error("usage: openklip export <slug>");
      const r = await exportCut(rest[0]);
      console.log(`exported ${r.ranges} ranges, ${r.durationSec.toFixed(1)}s -> ${r.out}`);
      break;
    }
    default:
      help();
  }
} catch (e) {
  console.error(`\nerror: ${(e as Error).message}\n`);
  process.exit(1);
}
