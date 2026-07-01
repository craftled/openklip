// Ingester plugins: a declarative seam for getting media INTO a project from
// somewhere other than a local file (URL download, batch folder, a Riverside /
// Descript export, …). Each lives as ingesters/<id>/ingester.json describing its
// form fields and the argv to run. OpenKlip ships the manifest format + loader +
// templating; the actual fetch command (e.g. yt-dlp) is the plugin author's dep,
// not bundled. Pure + dependency-free so it is unit-testable.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { repoPath } from "./repo-paths.ts";

export function ingestersRoot(): string {
  return repoPath("ingesters");
}

export const IngesterFieldSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  type: z.enum(["string", "number", "path"]).default("string"),
  required: z.boolean().default(false),
});
export type IngesterField = z.infer<typeof IngesterFieldSchema>;

export const IngesterSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional(),
    // Command + argv template. `{fieldName}` is replaced with the field value;
    // `{output}` is replaced with the path OpenKlip wants the media written to.
    command: z.string(),
    args: z.array(z.string()).default([]),
    fields: z.array(IngesterFieldSchema).default([]),
  })
  .strict();
export type Ingester = z.infer<typeof IngesterSchema>;

export async function loadIngesters(): Promise<Ingester[]> {
  const root = ingestersRoot();
  if (!existsSync(root)) {
    return [];
  }
  const out: Ingester[] = [];
  for (const entry of readdirSync(root)) {
    const manifestPath = join(root, entry, "ingester.json");
    if (!existsSync(manifestPath)) {
      continue;
    }
    out.push(
      IngesterSchema.parse(JSON.parse(await Bun.file(manifestPath).text()))
    );
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// Build the concrete argv for an ingester, substituting field values and the
// destination path. Validates that every required field has a value.
export function resolveIngesterArgv(
  manifest: Ingester,
  values: Record<string, string>,
  outputPath: string
): string[] {
  for (const field of manifest.fields) {
    if (field.required && !values[field.name]) {
      throw new Error(`missing required field "${field.name}"`);
    }
  }
  const subst = (s: string): string =>
    s.replace(/\{(\w+)\}/g, (match, key: string) => {
      if (key === "output") {
        return outputPath;
      }
      return values[key] ?? match;
    });
  return [manifest.command, ...manifest.args.map(subst)];
}
