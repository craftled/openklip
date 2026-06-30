import assert from "node:assert/strict";
import { test } from "node:test";
import { FilterSchema } from "../src/edl.ts";
import {
  FILTER_NAMES,
  FILTER_OPTIONS,
  filterChain,
  filterLabel,
  isFilter,
} from "../src/filter.ts";

test("none is a no-op (empty filter chain)", () => {
  assert.equal(filterChain("none"), "");
});

test("every non-none filter expands to a real ffmpeg filter chain", () => {
  for (const name of FILTER_NAMES) {
    const chain = filterChain(name);
    if (name === "none") {
      assert.equal(chain, "");
    } else {
      assert.ok(chain.length > 0, `${name} has a filter`);
      assert.match(chain, /eq=/, `${name} uses eq`);
    }
  }
});

test("muted desaturates and cools", () => {
  const chain = filterChain("muted");
  assert.match(chain, /saturation=0\.85/); // desaturated
  assert.match(chain, /colorbalance=/); // shifted toward cool
});

test("the filter chains carry no shell-breaking quotes for filter_complex", () => {
  for (const name of FILTER_NAMES) {
    assert.doesNotMatch(filterChain(name), /['"]/, `${name} is quote-free`);
  }
});

test("FilterSchema accepts every filter name and rejects unknowns", () => {
  for (const name of FILTER_NAMES) {
    assert.equal(FilterSchema.parse(name), name);
  }
  assert.throws(() => FilterSchema.parse("teal_orange"));
  // Defaulted: undefined resolves to "none".
  assert.equal(FilterSchema.parse(undefined), "none");
});

test("isFilter guards membership", () => {
  assert.equal(isFilter("cinematic"), true);
  assert.equal(isFilter("none"), true);
  assert.equal(isFilter("teal_orange"), false);
  assert.equal(isFilter(""), false);
});

test("FILTER_OPTIONS pairs every filter with a human label", () => {
  assert.equal(FILTER_OPTIONS.length, FILTER_NAMES.length);
  assert.equal(filterLabel("muted"), "Muted");
  assert.equal(filterLabel("cinematic"), "Cinematic");
  assert.equal(filterLabel("dramatic"), "Dramatic");
  assert.equal(filterLabel("none"), "None");
  for (const opt of FILTER_OPTIONS) {
    assert.ok(opt.label.length > 0);
  }
});
