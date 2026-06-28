import { basename, extname, join, resolve } from "node:path";
import { readConfiguredProjectsRoot } from "./workspace-config.ts";

// Parent directory containing project folders (each subdir with project.json).
// Override with OPENKLIP_PROJECTS_ROOT to use any folder on disk.
export function projectsRoot(): string {
  const env = process.env.OPENKLIP_PROJECTS_ROOT;
  if (env) {
    return resolve(env);
  }
  const configured = readConfiguredProjectsRoot();
  if (configured) {
    return configured;
  }
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
// user originals live in assets/; everything derived lives under working/
// (proxy, transcript, audio, frames, asset proxies, chats) and rendered output
// under output/. Proxy paths in project.json are relative to dir
// (e.g. "working/assets/b1.mp4"); user sources use "assets/track.mp3".
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
    /** User drop folder : originals only. */
    assets: join(dir, "assets"),
    /** Generated asset proxies (ffmpeg output). */
    assetProxies: join(working, "assets"),
    chats: join(working, "chats.json"),
    out: join(output, "out.mp4"),
  };
}

/** Relative path (from project dir) for a user asset original. */
export function assetSourceRelative(filename: string): string {
  return join("assets", filename);
}

/** Relative path (from project dir) for a generated asset proxy. */
export function assetProxyRelative(filename: string): string {
  return join("working", "assets", filename);
}

/** Absolute path to a stored asset file (proxy or user original). */
export function assetStoragePath(slug: string, relativePath: string): string {
  return join(projectDir(slug), relativePath);
}
