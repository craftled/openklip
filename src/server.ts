import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import index from "../web/index.html";
import { BrollSchema, type Project, ProjectSchema, ZoomSchema } from "./edl.ts";
import { exportCut } from "./exporter.ts";
import { assetProxyPath, PROJECTS_ROOT, projectPaths } from "./paths.ts";

function latestProject(): string | null {
  if (!existsSync(PROJECTS_ROOT)) return null;
  const dirs = readdirSync(PROJECTS_ROOT)
    .map((n) => ({ n, p: join(PROJECTS_ROOT, n) }))
    .filter((d) => {
      try {
        return statSync(d.p).isDirectory() && existsSync(join(d.p, "project.json"));
      } catch {
        return false;
      }
    })
    .sort((a, b) => statSync(b.p).mtimeMs - statSync(a.p).mtimeMs);
  return dirs[0]?.n ?? null;
}

async function loadProject(slug: string): Promise<Project> {
  return ProjectSchema.parse(JSON.parse(await Bun.file(projectPaths(slug).project).text()));
}

function serveRange(req: Request, path: string, type: string): Response {
  const file = Bun.file(path);
  const size = file.size;
  const range = req.headers.get("range");
  if (!range) {
    return new Response(file, {
      headers: { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": String(size), "Cache-Control": "no-store" },
    });
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m?.[1] ? Number.parseInt(m[1], 10) : 0;
  let end = m?.[2] ? Number.parseInt(m[2], 10) : size - 1;
  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end) || end >= size) end = size - 1;
  if (start > end) start = 0;
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Cache-Control": "no-store",
    },
  });
}

export async function serve(slugArg?: string, port = 4399): Promise<void> {
  const slug = slugArg ?? latestProject();
  if (!slug) throw new Error("no projects found. Run: bun run ingest <video>");
  if (!existsSync(projectPaths(slug).project)) throw new Error(`project not found: ${slug}`);
  console.log(`[serve] project: ${slug}`);

  const server = Bun.serve({
    port,
    development: true,
    routes: {
      "/": index,
      "/api/project": {
        async GET() {
          const project = await loadProject(slug);
          const mediaVersion = Math.round(statSync(projectPaths(slug).proxy).mtimeMs);
          return Response.json({ ...project, mediaVersion });
        },
        async POST(req: Request) {
          const body = (await req.json()) as {
            words?: Array<{ id: string; deleted: boolean }>;
            captions?: { enabled?: boolean };
          };
          const project = await loadProject(slug);
          if (body.words) {
            const del = new Map(body.words.map((w) => [w.id, w.deleted]));
            for (const w of project.words) if (del.has(w.id)) w.deleted = Boolean(del.get(w.id));
          }
          if (typeof body.captions?.enabled === "boolean") {
            project.captions = { ...project.captions, enabled: body.captions.enabled };
          }
          await Bun.write(projectPaths(slug).project, JSON.stringify(project, null, 2));
          return Response.json({ ok: true });
        },
      },
      "/api/export": {
        async POST(req: Request) {
          try {
            const body = (await req.json().catch(() => ({}))) as { maxHeight?: number };
            return Response.json({ ok: true, ...(await exportCut(slug, { maxHeight: body.maxHeight })) });
          } catch (e) {
            return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
          }
        },
      },
      "/api/look": {
        async POST(req: Request) {
          const body = (await req.json()) as { vignette?: boolean };
          const project = await loadProject(slug);
          if (typeof body.vignette === "boolean") project.look = { ...project.look, vignette: body.vignette };
          await Bun.write(projectPaths(slug).project, JSON.stringify(project, null, 2));
          return Response.json({ ok: true });
        },
      },
      "/api/zooms": {
        async POST(req: Request) {
          const body = (await req.json()) as { zooms?: unknown[] };
          const project = await loadProject(slug);
          const dur = project.durationSamples;
          const items = [];
          for (const raw of body.zooms ?? []) {
            const z = ZoomSchema.parse(raw);
            const start = Math.max(0, Math.min(z.startSample, dur));
            const end = Math.max(start + 1, Math.min(z.endSample, dur));
            items.push({ ...z, startSample: start, endSample: end });
          }
          project.zooms = items;
          await Bun.write(projectPaths(slug).project, JSON.stringify(project, null, 2));
          return Response.json({ ok: true, zooms: items });
        },
      },
      "/api/broll": {
        async POST(req: Request) {
          const body = (await req.json()) as { broll?: unknown[] };
          const project = await loadProject(slug);
          const assetIds = new Set(project.assets.map((a) => a.id));
          const dur = project.durationSamples;
          const items = [];
          for (const raw of body.broll ?? []) {
            const b = BrollSchema.parse(raw);
            if (!assetIds.has(b.assetId)) continue;
            const start = Math.max(0, Math.min(b.startSample, dur));
            const end = Math.max(start + 1, Math.min(b.endSample, dur));
            items.push({ ...b, startSample: start, endSample: end });
          }
          project.broll = items;
          await Bun.write(projectPaths(slug).project, JSON.stringify(project, null, 2));
          return Response.json({ ok: true, broll: items });
        },
      },
      "/media/proxy.mp4": (req: Request) => serveRange(req, projectPaths(slug).proxy, "video/mp4"),
      "/media/asset/:id": (req: Request & { params: { id: string } }) => {
        const id = req.params.id.replace(/[^a-zA-Z0-9._-]/g, "");
        const fp = assetProxyPath(slug, id);
        if (!existsSync(fp)) return new Response("not found", { status: 404 });
        return serveRange(req, fp, "video/mp4");
      },
      "/media/frames/:name": (req: Request & { params: { name: string } }) => {
        const name = req.params.name.replace(/[^a-zA-Z0-9._-]/g, "");
        const fp = join(projectPaths(slug).frames, name);
        if (!existsSync(fp)) return new Response("not found", { status: 404 });
        return new Response(Bun.file(fp), { headers: { "Content-Type": "image/jpeg" } });
      },
    },
    error(e: Error) {
      return new Response(`server error: ${e.message}`, { status: 500 });
    },
  });
  console.log(`\n  openklip ready  ->  http://localhost:${server.port}\n`);
}
