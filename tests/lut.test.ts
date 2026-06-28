import assert from "node:assert/strict";
import { test } from "node:test";
import {
  escapeFilterPath,
  listLuts,
  lut3dExpr,
  lutPath,
  lutsRoot,
} from "../src/lut.ts";

test("lutPath resolves a name under luts/ with the .cube extension", () => {
  const p = lutPath("rec709");
  assert.ok(p.startsWith(lutsRoot()));
  assert.ok(p.endsWith("rec709.cube"));
});

test("lutPath rejects traversal and bad names", () => {
  assert.throws(() => lutPath("../secrets"), /invalid LUT name/);
  assert.throws(() => lutPath("a/b"), /invalid LUT name/);
  assert.throws(() => lutPath(""), /invalid LUT name/);
});

test("escapeFilterPath escapes backslashes and quotes for filter_complex", () => {
  assert.equal(escapeFilterPath("/a/b.cube"), "/a/b.cube");
  assert.equal(escapeFilterPath("/it's/x.cube"), "/it\\'s/x.cube");
  assert.equal(escapeFilterPath("C:\\luts\\x.cube"), "C:\\\\luts\\\\x.cube");
});

test("lut3dExpr wraps the escaped path in a quoted file= option", () => {
  assert.equal(lut3dExpr("/a/b.cube"), "lut3d=file='/a/b.cube'");
  assert.equal(lut3dExpr("/it's/x.cube"), "lut3d=file='/it\\'s/x.cube'");
});

test("listLuts includes the shipped identity example", () => {
  // luts/identity.cube is committed as a working example.
  assert.ok(listLuts().includes("identity"));
});
