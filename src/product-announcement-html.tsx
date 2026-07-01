import {
  assertProductAnnouncementSpec,
  type ProductAnnouncementSpec,
} from "./product-announcement.ts";

export async function renderProductAnnouncementHtml(
  spec: ProductAnnouncementSpec
): Promise<string> {
  const [{ renderToStaticMarkup }, { ProductAnnouncementFrame }] =
    await Promise.all([
      import("react-dom/server"),
      import("../web/components/product-announcement-frame.tsx"),
    ]);
  const validated = assertProductAnnouncementSpec(spec);
  return renderToStaticMarkup(<ProductAnnouncementFrame spec={validated} />);
}
