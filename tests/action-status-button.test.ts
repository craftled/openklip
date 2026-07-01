import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionStatusButton } from "../web/components/action-status-button.tsx";

function TestIcon(props: { className?: string; "data-icon"?: string }) {
  return createElement("svg", props);
}

test("ActionStatusButton exposes busy state and swaps to busy label", () => {
  const html = renderToStaticMarkup(
    createElement(ActionStatusButton, {
      busy: true,
      busyLabel: "Working...",
      disabled: true,
      icon: TestIcon,
      label: "Run",
    })
  );

  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /animate-pulse/);
  assert.match(html, /Working\.\.\./);
  assert.doesNotMatch(html, />Run</);
});
