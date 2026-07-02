// `openklip doctor` : environment + project health checks. An agent's most
// common silent failures are a missing ffmpeg path, a missing whisper script,
// or a stale/absent proxy. This surfaces them up front so the cut → export loop
// doesn't die deep inside a subprocess. Pure (returns a structured report) so it
// is testable without spawning anything.
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { type Project, ProjectSchema } from "./edl.ts";
import { FFMPEG, FFPROBE } from "./ffmpeg.ts";
import { projectPaths, projectsRoot } from "./paths.ts";
import { transcribeScriptPath } from "./script-paths.ts";

export type DoctorStatus = "ok" | "warn" | "fail";

export interface DoctorCheck {
  detail: string;
  name: string;
  status: DoctorStatus;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  ok: boolean;
}

function check(
  name: string,
  status: DoctorStatus,
  detail: string
): DoctorCheck {
  return { name, status, detail };
}

function binaryCheck(name: string, path: string): DoctorCheck {
  if (path && existsSync(path)) {
    return check(name, "ok", path);
  }
  return check(name, "fail", `not found: ${path || "(unresolved)"}`);
}

function whisperCheck(): DoctorCheck {
  const script = transcribeScriptPath();
  return existsSync(script)
    ? check("whisper", "ok", script)
    : check("whisper", "fail", `transcribe script missing: ${script}`);
}

function projectsRootCheck(): DoctorCheck {
  const root = projectsRoot();
  return existsSync(root)
    ? check("projects-root", "ok", root)
    : check("projects-root", "warn", `projects root not created yet: ${root}`);
}

function relPath(dir: string, p: string): string {
  return isAbsolute(p) ? p : join(dir, p);
}

function mediaCheck(slug: string, dir: string, project: Project): DoctorCheck {
  const name = `media:${slug}`;
  if (existsSync(project.source)) {
    return check(name, "ok", `source present: ${project.source}`);
  }
  const proxy = relPath(dir, project.proxy);
  if (existsSync(proxy)) {
    return check(
      name,
      "warn",
      `source missing (${project.source}); will export from proxy: ${proxy}`
    );
  }
  return check(
    name,
    "fail",
    `no source and no proxy (source: ${project.source}, proxy: ${proxy})`
  );
}

function assetsCheck(slug: string, dir: string, project: Project): DoctorCheck {
  const name = `assets:${slug}`;
  if (project.assets.length === 0) {
    return check(name, "ok", "no assets registered");
  }
  const broken = project.assets.filter(
    (a) => !(existsSync(a.src) || existsSync(relPath(dir, a.proxy)))
  );
  if (broken.length === 0) {
    return check(name, "ok", `${project.assets.length} asset(s) resolvable`);
  }
  return check(
    name,
    "fail",
    `${broken.length} asset(s) missing both src and proxy: ${broken
      .map((a) => a.id)
      .join(", ")}`
  );
}

async function projectChecks(slug: string): Promise<DoctorCheck[]> {
  let paths: ReturnType<typeof projectPaths>;
  try {
    paths = projectPaths(slug);
  } catch (e) {
    return [check(`project:${slug}`, "fail", (e as Error).message)];
  }
  if (!existsSync(paths.project)) {
    return [check(`project:${slug}`, "fail", `project not found: ${slug}`)];
  }
  let project: Project;
  try {
    project = ProjectSchema.parse(
      JSON.parse(await Bun.file(paths.project).text())
    );
  } catch (e) {
    return [
      check(
        `project:${slug}`,
        "fail",
        `invalid project.json: ${(e as Error).message}`
      ),
    ];
  }
  return [
    check(`project:${slug}`, "ok", `${project.words.length} words`),
    mediaCheck(slug, paths.dir, project),
    assetsCheck(slug, paths.dir, project),
  ];
}

export async function runDoctor(slug?: string): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [
    binaryCheck("ffmpeg", FFMPEG),
    binaryCheck("ffprobe", FFPROBE),
    whisperCheck(),
    projectsRootCheck(),
  ];
  if (slug) {
    checks.push(...(await projectChecks(slug)));
  }
  return { ok: checks.every((c) => c.status !== "fail"), checks };
}
