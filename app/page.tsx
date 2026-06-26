import { App } from "@/app";
import { loadEditorProject } from "./lib/project-data";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ slug?: string }>;
}

export default async function Page({ searchParams }: Props) {
  const { slug } = await searchParams;
  const project = await loadEditorProject(slug ?? null);
  return <App initialProject={project} />;
}
