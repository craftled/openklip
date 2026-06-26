// HTTP Range / 206 byte-range streaming of a local file, for Next route
// handlers (must run with `export const runtime = "nodejs"`). Streams in
// bounded chunks via createReadStream so video seeking never buffers the whole
// file. 1:1 port of the old Bun.serve serveRange semantics.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

export async function serveRange(req: Request, filePath: string, contentType: string): Promise<Response> {
  const { size } = await stat(filePath);
  const range = req.headers.get("range");

  if (!range) {
    const node = createReadStream(filePath);
    req.signal.addEventListener("abort", () => node.destroy());
    return new Response(Readable.toWeb(node) as unknown as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Content-Length": String(size),
        "Cache-Control": "no-store",
      },
    });
  }

  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m?.[1] ? Number.parseInt(m[1], 10) : 0;
  let end = m?.[2] ? Number.parseInt(m[2], 10) : size - 1;
  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end) || end >= size) end = size - 1;
  if (start > end) start = 0;

  // createReadStream's `end` is inclusive, matching Bun's slice(start, end + 1).
  const node = createReadStream(filePath, { start, end });
  req.signal.addEventListener("abort", () => node.destroy());
  return new Response(Readable.toWeb(node) as unknown as ReadableStream<Uint8Array>, {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Cache-Control": "no-store",
    },
  });
}
