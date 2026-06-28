export interface ProjectListing {
  mtimeMs: number;
  slug: string;
}

export function projectInitial(slug: string): string {
  const base = slug.split(/[-_.]/)[0] ?? slug;
  return (base.charAt(0) || "?").toUpperCase();
}

export function findActiveProject(
  projects: ProjectListing[],
  activeSlug: string
): ProjectListing {
  return (
    projects.find((p) => p.slug === activeSlug) ?? {
      slug: activeSlug,
      mtimeMs: Date.now(),
    }
  );
}

export function projectAtShortcutIndex(
  projects: ProjectListing[],
  index: number
): ProjectListing | undefined {
  if (index < 1 || index > 9) {
    return;
  }
  return projects[index - 1];
}
