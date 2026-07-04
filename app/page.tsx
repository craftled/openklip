import { EditorHome } from "./lib/editor-home";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ slug?: string }>;
}

export default async function Page({ searchParams }: Props) {
  const { slug } = await searchParams;
  return <EditorHome slug={slug ?? null} />;
}
