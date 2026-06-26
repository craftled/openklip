import { basename, extname, join, resolve } from "node:path";

// projects/ lives at the repo root. Resolve against cwd (the dir Next/the CLI
// runs from) so this works under both Bun and Node and isn't affected by
// bundler rewrites of import.meta.
export const PROJECTS_ROOT = resolve(process.cwd(), "projects");

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "project"
  );
}

export function slugFromVideo(videoPath: string): string {
  return slugify(basename(videoPath, extname(videoPath)));
}

export function projectDir(slug: string): string {
  return join(PROJECTS_ROOT, slug);
}

export function projectPaths(slug: string) {
  const dir = projectDir(slug);
  return {
    dir,
    project: join(dir, "project.json"),
    transcript: join(dir, "transcript.json"),
    proxy: join(dir, "proxy.mp4"),
    audioRaw: join(dir, "audio16k.f32"),
    frames: join(dir, "frames"),
    assets: join(dir, "assets"),
    out: join(dir, "out.mp4"),
  };
}

export function assetProxyPath(slug: string, assetId: string): string {
  return join(projectDir(slug), "assets", `${assetId}.mp4`);
}
