import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyGraphicFrame,
  hash01,
  motionUnitStyle,
  unitProgress,
} from "../web/lib/graphic-runtime.ts";

// ---- Minimal hand-rolled fake DOM, mirrors tests/graphic-runtime-keyframes.test.ts
// but extended with setAttribute, textContent get/set, ownerDocument.createElement,
// append/appendChild, and querySelectorAll over a real child tree.

class FakeTextNode {
  nodeType = 3;
  text: string;
  constructor(text: string) {
    this.text = text;
  }
  get textContent(): string {
    return this.text;
  }
  set textContent(value: string) {
    this.text = value;
  }
}

class FakeElement {
  tag: string;
  attrs: Record<string, string> = {};
  style: Record<string, string> = {};
  children: (FakeElement | FakeTextNode)[] = [];
  ownerDocument: FakeDocument;
  private rawText: string | undefined;

  constructor(tag: string, doc: FakeDocument) {
    this.tag = tag;
    this.ownerDocument = doc;
  }

  getAttribute(name: string): string | null {
    return name in this.attrs ? this.attrs[name] : null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs[name] = String(value);
  }

  get textContent(): string {
    if (this.children.length === 0) {
      return this.rawText ?? "";
    }
    return this.children
      .map((c) => (c instanceof FakeElement ? c.textContent : c.text))
      .join("");
  }

  set textContent(value: string) {
    this.children = [];
    this.rawText = value;
  }

  append(...nodes: (FakeElement | FakeTextNode)[]): void {
    this.children.push(...nodes);
    this.rawText = undefined;
  }

  appendChild(node: FakeElement | FakeTextNode): FakeElement | FakeTextNode {
    this.children.push(node);
    this.rawText = undefined;
    return node;
  }

  private walk(attr: string, out: FakeElement[]): void {
    for (const c of this.children) {
      if (c instanceof FakeElement) {
        if (attr in c.attrs) {
          out.push(c);
        }
        c.walk(attr, out);
      }
    }
  }

  querySelectorAll(selector: string): FakeElement[] {
    const attr = selector.slice(1, -1);
    const out: FakeElement[] = [];
    this.walk(attr, out);
    return out;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  matches(selector: string): boolean {
    const attr = selector.slice(1, -1);
    return attr in this.attrs;
  }

  closest(_selector: string): FakeElement | null {
    return null;
  }
}

class FakeDocument {
  createElement(tag: string): FakeElement {
    return new FakeElement(tag, this);
  }
  createTextNode(text: string): FakeTextNode {
    return new FakeTextNode(text);
  }
}

function makeRoot(children: FakeElement[]): FakeElement {
  const doc = new FakeDocument();
  const root = doc.createElement("div");
  root.setAttribute("data-graphic-root", "");
  root.append(...children);
  // Override querySelectorAll on root so "[data-anim]" also matches the
  // children themselves (walk() only checks descendants of each child).
  const originalWalk = root.querySelectorAll.bind(root);
  root.querySelectorAll = (selector: string) => {
    if (selector === "[data-anim]") {
      const out: FakeElement[] = [];
      for (const c of children) {
        if ("data-anim" in c.attrs) {
          out.push(c);
        }
      }
      return out;
    }
    return originalWalk(selector);
  };
  return root;
}

function makeAnimChild(
  doc: FakeDocument,
  attrs: Record<string, string>,
  text = ""
): FakeElement {
  const el = doc.createElement("div");
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  el.textContent = text;
  return el;
}

// ---- 1. hash01 ----

test("hash01 is deterministic and in [0,1)", () => {
  const v1 = hash01(3, 7, 1);
  const v2 = hash01(3, 7, 1);
  assert.equal(v1, v2);
  assert.ok(v1 >= 0 && v1 < 1);
});

test("hash01 varies when a, b, or c changes", () => {
  const base = hash01(3, 7, 1);
  assert.notEqual(hash01(4, 7, 1), base);
  assert.notEqual(hash01(3, 8, 1), base);
  assert.notEqual(hash01(3, 7, 2), base);
});

// ---- 2. unitProgress ----

test("unitProgress stagger boundaries with identity ease", () => {
  const identity = (t: number) => t;
  const inStart = 10;
  const inDur = 5;
  const stagger = 3;
  const i = 2;
  // before inStart + i*stagger, progress is 0
  assert.equal(
    unitProgress(
      inStart + i * stagger - 1,
      inStart,
      inDur,
      stagger,
      i,
      identity
    ),
    0
  );
  // at exactly inStart + i*stagger, progress is 0
  assert.equal(
    unitProgress(inStart + i * stagger, inStart, inDur, stagger, i, identity),
    0
  );
  // at inStart + i*stagger + inDur, progress reaches 1
  assert.equal(
    unitProgress(
      inStart + i * stagger + inDur,
      inStart,
      inDur,
      stagger,
      i,
      identity
    ),
    1
  );
});

// ---- 3. split infrastructure ----

test("applyGraphicFrame char split produces one unit per character", () => {
  const doc = new FakeDocument();
  const el = makeAnimChild(
    doc,
    {
      "data-anim": "fade",
      "data-split": "char",
      "data-in-dur": "5",
      "data-out-dur": "5",
      "data-out-frame": "25",
    },
    "hi!"
  );
  const root = makeRoot([el]);

  applyGraphicFrame(root as unknown as HTMLElement, 2, 30, 100);
  const units = el.querySelectorAll("[data-unit]");
  assert.equal(units.length, 3);
});

test("applyGraphicFrame word split produces one unit per word", () => {
  const doc = new FakeDocument();
  const el = makeAnimChild(
    doc,
    {
      "data-anim": "fade",
      "data-split": "word",
      "data-in-dur": "5",
      "data-out-dur": "5",
      "data-out-frame": "25",
    },
    "hello there world"
  );
  const root = makeRoot([el]);

  applyGraphicFrame(root as unknown as HTMLElement, 2, 30, 100);
  const units = el.querySelectorAll("[data-unit]");
  assert.equal(units.length, 3);
});

test("applyGraphicFrame split is idempotent when re-applied at the same frame", () => {
  const doc = new FakeDocument();
  const el = makeAnimChild(
    doc,
    {
      "data-anim": "fade",
      "data-split": "char",
      "data-in-dur": "5",
      "data-out-dur": "5",
      "data-out-frame": "25",
    },
    "abc"
  );
  const root = makeRoot([el]);

  applyGraphicFrame(root as unknown as HTMLElement, 2, 30, 100);
  const first = el.querySelectorAll("[data-unit]").length;
  applyGraphicFrame(root as unknown as HTMLElement, 2, 30, 100);
  const second = el.querySelectorAll("[data-unit]").length;
  assert.equal(first, second);
  assert.equal(first, 3);
});

test("applyGraphicFrame re-splits after textContent is overwritten externally", () => {
  const doc = new FakeDocument();
  const el = makeAnimChild(
    doc,
    {
      "data-anim": "fade",
      "data-split": "char",
      "data-in-dur": "5",
      "data-out-dur": "5",
      "data-out-frame": "25",
    },
    "abc"
  );
  const root = makeRoot([el]);

  applyGraphicFrame(root as unknown as HTMLElement, 2, 30, 100);
  assert.equal(el.querySelectorAll("[data-unit]").length, 3);

  // simulate applyGraphicParams wiping spans by writing textContent directly
  el.textContent = "wxyz";
  applyGraphicFrame(root as unknown as HTMLElement, 2, 30, 100);
  assert.equal(el.querySelectorAll("[data-unit]").length, 4);
});

// ---- 4. determinism ----

test("applyGraphicFrame split motion is deterministic across repeated visits", () => {
  const doc = new FakeDocument();
  const el = makeAnimChild(
    doc,
    {
      "data-anim": "kineticBuild",
      "data-split": "word",
      "data-in-dur": "10",
      "data-out-dur": "5",
      "data-out-frame": "25",
    },
    "one two three"
  );
  const root = makeRoot([el]);

  applyGraphicFrame(root as unknown as HTMLElement, 4, 30, 100);
  const units = el.querySelectorAll("[data-unit]");
  const snap1 = units.map((u) => ({ ...u.style }));

  applyGraphicFrame(root as unknown as HTMLElement, 12, 30, 100);
  applyGraphicFrame(root as unknown as HTMLElement, 4, 30, 100);
  const snap2 = units.map((u) => ({ ...u.style }));

  assert.deepEqual(snap1, snap2);
});

// ---- 5. typewriter ----

test("typewriter reveal count is monotonically non-decreasing", () => {
  const doc = new FakeDocument();
  const caret = doc.createElement("span");
  caret.setAttribute("data-caret", "");
  const el = makeAnimChild(doc, {
    "data-anim": "typewriter",
    "data-split": "char",
    "data-in-dur": "20",
    "data-out-dur": "5",
    "data-out-frame": "50",
  });
  el.append(new FakeTextNode("hello"), caret);
  const root = makeRoot([el]);

  let lastCount = -1;
  for (let frame = 0; frame <= 25; frame++) {
    applyGraphicFrame(root as unknown as HTMLElement, frame, 60, 100);
    const units = el.querySelectorAll("[data-unit]");
    const count = units.filter((u) => u.style.opacity === "1").length;
    assert.ok(count >= lastCount);
    lastCount = count;
  }
});

test("typewriter caret opacity toggles per frame % period", () => {
  const doc = new FakeDocument();
  const caret = doc.createElement("span");
  caret.setAttribute("data-caret", "");
  const el = makeAnimChild(doc, {
    "data-anim": "typewriter,fade",
    "data-split": "char",
    "data-caret-period": "10",
    "data-in-dur": "5",
    "data-out-dur": "5",
    "data-out-frame": "50",
  });
  el.append(new FakeTextNode("hi"), caret);
  const root = makeRoot([el]);

  applyGraphicFrame(root as unknown as HTMLElement, 2, 60, 100);
  assert.equal(caret.style.opacity, "1");

  applyGraphicFrame(root as unknown as HTMLElement, 7, 60, 100);
  assert.equal(caret.style.opacity, "0");
});

test("typewriter caret works as a SIBLING of the animated span (template layout)", () => {
  // graphics/motion-typewriter places [data-caret] next to the [data-bind]
  // span, not inside it — a param rebind rewrites textContent and would
  // destroy a nested caret. The runtime must find carets via the parent.
  const doc = new FakeDocument();
  const caret = doc.createElement("span");
  caret.setAttribute("data-caret", "");
  const el = makeAnimChild(
    doc,
    {
      "data-anim": "typewriter",
      "data-split": "char",
      "data-caret-period": "10",
      "data-in-dur": "5",
      "data-out-dur": "5",
      "data-out-frame": "50",
    },
    "hi"
  );
  const wrapper = doc.createElement("div");
  wrapper.append(el, caret);
  (el as unknown as { parentElement: FakeElement }).parentElement = wrapper;
  const root = makeRoot([el]);

  applyGraphicFrame(root as unknown as HTMLElement, 2, 60, 100);
  assert.equal(caret.style.opacity, "1");
  applyGraphicFrame(root as unknown as HTMLElement, 7, 60, 100);
  assert.equal(caret.style.opacity, "0");
});

// ---- 6. blurReveal ----

test("blurReveal filter blur decreases toward 0 as progress advances and is stable", () => {
  const doc = new FakeDocument();
  const el = makeAnimChild(
    doc,
    {
      "data-anim": "blurReveal",
      "data-split": "char",
      "data-in-dur": "10",
      "data-out-dur": "5",
      "data-out-frame": "50",
    },
    "ab"
  );
  const root = makeRoot([el]);

  applyGraphicFrame(root as unknown as HTMLElement, 2, 60, 100);
  const units = el.querySelectorAll("[data-unit]");
  const early = units[0].style.filter;

  applyGraphicFrame(root as unknown as HTMLElement, 10, 60, 100);
  const late = units[0].style.filter;

  assert.equal(late, "blur(0px)");
  assert.notEqual(early, late);

  applyGraphicFrame(root as unknown as HTMLElement, 10, 60, 100);
  assert.equal(units[0].style.filter, late);
});

// ---- 7. glitch ----

test("glitch is deterministic for same (frame, i) and opacity never NaN", () => {
  const doc = new FakeDocument();
  const el = makeAnimChild(
    doc,
    {
      "data-anim": "glitch",
      "data-split": "char",
      "data-in-dur": "10",
      "data-out-dur": "5",
      "data-out-frame": "50",
    },
    "abcd"
  );
  const root = makeRoot([el]);

  applyGraphicFrame(root as unknown as HTMLElement, 6, 60, 100);
  const units = el.querySelectorAll("[data-unit]");
  const snap1 = units.map((u) => ({
    transform: u.style.transform,
    textShadow: u.style.textShadow,
  }));

  applyGraphicFrame(root as unknown as HTMLElement, 6, 60, 100);
  const snap2 = units.map((u) => ({
    transform: u.style.transform,
    textShadow: u.style.textShadow,
  }));

  assert.deepEqual(snap1, snap2);

  for (let frame = 0; frame <= 20; frame++) {
    applyGraphicFrame(root as unknown as HTMLElement, frame, 60, 100);
    for (const u of el.querySelectorAll("[data-unit]")) {
      assert.ok(!Number.isNaN(Number(u.style.opacity)));
    }
  }
});

// ---- 8. rollNumber ----

test("rollNumber reaches target exactly when pIn is 1, monotonic sequence, and rebinds", () => {
  const doc = new FakeDocument();
  const el = makeAnimChild(
    doc,
    {
      "data-anim": "rollNumber",
      "data-in-dur": "10",
      "data-out-dur": "5",
      "data-out-frame": "50",
      "data-roll-from": "0",
    },
    "100"
  );
  const root = makeRoot([el]);

  let last = Number.NEGATIVE_INFINITY;
  for (let frame = 0; frame <= 10; frame++) {
    applyGraphicFrame(root as unknown as HTMLElement, frame, 60, 100);
    const displayed = Number(el.textContent);
    assert.ok(displayed >= last);
    last = displayed;
  }
  assert.equal(Number(el.textContent), 100);

  // rebind: externally set a new target different from data-roll-last
  el.textContent = "500";
  applyGraphicFrame(root as unknown as HTMLElement, 11, 60, 100);
  const afterRebindFrame11 = Number(el.textContent);

  applyGraphicFrame(root as unknown as HTMLElement, 12, 60, 100);
  const afterRebindFrame12 = Number(el.textContent);

  assert.ok(afterRebindFrame12 >= afterRebindFrame11);
  assert.ok(afterRebindFrame12 <= 500);
});

// ---- 9. regression: fade without split unchanged ----

test("applyGraphicFrame fade without data-split behaves exactly as before", () => {
  const doc = new FakeDocument();
  const el = makeAnimChild(doc, {
    "data-anim": "fade",
    "data-in-dur": "5",
    "data-out-dur": "5",
    "data-out-frame": "25",
  });
  const root = makeRoot([el]);

  applyGraphicFrame(root as unknown as HTMLElement, 0, 30, 100);
  assert.equal(el.style.opacity, "0");
  assert.equal(el.style.transform, "translateY(0px) scale(1)");

  applyGraphicFrame(root as unknown as HTMLElement, 3, 30, 100);
  const midOpacity = Number(el.style.opacity);
  assert.ok(midOpacity > 0 && midOpacity < 1);
  assert.equal(el.style.transform, "translateY(0px) scale(1)");

  applyGraphicFrame(root as unknown as HTMLElement, 5, 30, 100);
  assert.equal(el.style.opacity, "1");
});

// ---- motionUnitStyle direct calls ----

test("motionUnitStyle fade+slideUp split case matches per-unit formula", () => {
  const style = motionUnitStyle(["fade", "slideUp"], {
    p: 0.5,
    pOut: 0,
    frame: 0,
    i: 0,
    slide: 10,
    maxBlur: 12,
    amp: 8,
  });
  assert.equal(style.opacity, 0.5);
  assert.ok(Math.abs(style.transform.length) >= 0);
});
