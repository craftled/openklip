import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getNextToggleGroupValues,
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

test("single ToggleGroup keeps the selected value when pressed again", () => {
  const selectedValues = ["a"];
  const nextValues = getNextToggleGroupValues({
    isMultiple: false,
    itemValue: "a",
    pressed: false,
    selectedValues,
  });

  assert.equal(nextValues, selectedValues);
});

test("multiple ToggleGroup can remove one selected value", () => {
  assert.deepEqual(
    getNextToggleGroupValues({
      isMultiple: true,
      itemValue: "a",
      pressed: false,
      selectedValues: ["a", "b"],
    }),
    ["b"]
  );
});
