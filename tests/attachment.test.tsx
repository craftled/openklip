import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Attachment,
  AttachmentMedia,
} from "../web/components/ui/attachment.tsx";

test("attachment outer radius stays concentric with inner media radius (default size)", () => {
  const html = renderToStaticMarkup(
    <Attachment data-testid="attachment-root">
      <AttachmentMedia />
    </Attachment>
  );
  // default size pads the media by p-2 (8px); AttachmentMedia is rounded-lg (10px).
  // Concentric outer radius = 10 + 8 = 18px = rounded-2xl.
  const rootStart = html.indexOf("<div");
  const rootEnd = html.indexOf(">", rootStart);
  const rootTag = html.slice(rootStart, rootEnd + 1);
  assert.match(rootTag, /rounded-2xl/);
  assert.ok(
    !rootTag.includes("rounded-xl "),
    "outer container should no longer carry the mismatched rounded-xl"
  );
  assert.match(html, /rounded-lg/);
});
