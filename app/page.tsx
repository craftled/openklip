import { MarketingSite } from "@/components/marketing-site";
import { isMarketingSite } from "@/lib/site-mode";
import { EditorHome } from "./lib/editor-home";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ slug?: string }>;
}

export default async function Page({ searchParams }: Props) {
  if (isMarketingSite()) {
    return <MarketingSite />;
  }

  const { slug } = await searchParams;
  return <EditorHome slug={slug ?? null} />;
}
