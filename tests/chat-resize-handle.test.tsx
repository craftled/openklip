import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatResizeHandle } from "../web/components/chat-resize-handle.tsx";

// better-ui principle 13 (minimum hit area): the visible w-1.5 (6px) drag bar
// gets a pseudo-element that widens the grab zone horizontally without
// changing the visible bar width.
test("ChatResizeHandle widens its grab zone via a pseudo-element without changing the visible bar width", () => {
  const html = renderToStaticMarkup(
    <ChatResizeHandle onResize={() => undefined} width={480} />
  );
  assert.match(html, /after:absolute/);
  assert.match(html, /after:inset-y-0/);
  assert.match(html, /after:-inset-x-2/);
  // Visible bar stays w-1.5.
  assert.match(html, /\bw-1\.5\b/);
});
