import { existsSync } from "node:fs";
import { assertValidSlug, projectPaths } from "@engine/paths";
import { notFound } from "next/navigation";
import { EditorHome } from "../lib/editor-home";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ProjectSlugPage({ params }: Props) {
  const { slug } = await params;
  try {
    assertValidSlug(slug);
  } catch {
    notFound();
  }
  if (!existsSync(projectPaths(slug).project)) {
    notFound();
  }
  return <EditorHome slug={slug} />;
}
