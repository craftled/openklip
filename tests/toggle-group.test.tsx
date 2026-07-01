import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../web/components/ui/toggle-group.tsx";

test("ToggleGroup disabled state disables child items", () => {
  const html = renderToStaticMarkup(
    <ToggleGroup disabled value="a">
      <ToggleGroupItem value="a">A</ToggleGroupItem>
      <ToggleGroupItem value="b">B</ToggleGroupItem>
    </ToggleGroup>
  );

  assert.match(html, /aria-disabled="true"/);
  assert.equal(html.match(/<button[^>]*disabled=""/g)?.length, 2);
});
