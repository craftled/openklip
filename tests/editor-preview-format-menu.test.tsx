import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorPreviewFormatMenu } from "../web/components/editor/editor-preview-format-menu.tsx";

// better-ui principle 13 (minimum hit area): the compact rounded-full pill
// (px-1 py-px text-[10px]) needs vertical hit slop via a pseudo-element,
// without changing its visible compact size.
test("EditorPreviewFormatMenu trigger pill gets vertical hit slop via a pseudo-element", () => {
  const html = renderToStaticMarkup(
    <EditorPreviewFormatMenu
      onOrientationChange={() => undefined}
      onSafeAreaGuideChange={() => undefined}
      orientation="landscape"
      safeAreaGuide="off"
    />
  );
  assert.match(html, /after:absolute/);
  assert.match(html, /after:-inset-y-2/);
  assert.match(html, /after:inset-x-0/);
  // Visible pill stays compact.
  assert.match(html, /px-1 py-px text-\[10px\]/);
});
