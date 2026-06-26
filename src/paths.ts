import { basename, extname, join, resolve } from "node:path";

// projects/ lives at the repo root. Resolve against cwd (the dir Next/the CLI
// runs from) so this works under both Bun and Node and isn't affected by
// bundler rewrites of import.meta.
export function projectsRoot(): string {
  return resolve(process.cwd(), "projects");
}

// A slug names a directory directly under projects/. Validate before any path
// join so a hostile slug (e.g. "../../etc") cannot traverse out of the project
// tree. Network routes pass [slug] straight from the URL, so this is the single
// gate that keeps reads/writes inside projects/.
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function assertValidSlug(slug: string): string {
  if (
    typeof slug === "string" &&
    slug.length <= 64 &&
    SLUG_PATTERN.test(slug)
  ) {
    return slug;
  }
  throw new Error(`invalid project slug: ${JSON.stringify(slug)}`);
}

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
  return join(projectsRoot(), assertValidSlug(slug));
}

// Layered project layout. `project.json` (the edit) stays at the project root;
// everything derived lives under working/ (proxy, transcript, audio, frames,
// asset proxies, export scratch) and rendered output under output/. Asset proxy
// paths stored in project.json are RELATIVE to dir (e.g. "working/assets/b1.mp4").
export function projectPaths(slug: string) {
  const dir = projectDir(slug);
  const working = join(dir, "working");
  const output = join(dir, "output");
  return {
    dir,
    working,
    output,
    project: join(dir, "project.json"),
    transcript: join(working, "transcript.json"),
    proxy: join(working, "proxy.mp4"),
    audioRaw: join(working, "audio16k.f32"),
    frames: join(working, "frames"),
    assets: join(working, "assets"),
    out: join(output, "out.mp4"),
  };
}

/** Absolute path to a registered asset proxy (proxy field is relative to project dir). */
export function assetStoragePath(slug: string, proxyRelative: string): string {
  return join(projectDir(slug), proxyRelative);
}

/** @deprecated Prefer assetStoragePath(slug, asset.proxy). Kept for legacy ids. */
export function assetProxyPath(slug: string, assetId: string): string {
  return join(projectDir(slug), "working", "assets", `${assetId}.mp4`);
}

/** Relative (to project dir) storage path for a new asset proxy of the given filename. */
export function assetProxyRelative(filename: string): string {
  return join("working", "assets", filename);
}
