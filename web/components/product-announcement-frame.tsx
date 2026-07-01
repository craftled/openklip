"use client";

import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import type { CSSProperties } from "react";
import {
  PRODUCT_ANNOUNCEMENT_FPS,
  PRODUCT_ANNOUNCEMENT_HEIGHT,
  PRODUCT_ANNOUNCEMENT_WIDTH,
  type ProductAnnouncementSpec,
  productAnnouncementCatalog,
} from "../../src/product-announcement.ts";

const PRODUCT_ANNOUNCEMENT_CSS = `
.ok-pa-root {
  --accent: #f0b429;
  position: relative;
  box-sizing: border-box;
  width: ${PRODUCT_ANNOUNCEMENT_WIDTH}px;
  height: ${PRODUCT_ANNOUNCEMENT_HEIGHT}px;
  overflow: hidden;
  background: #121416;
  color: #ffffff;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.ok-pa-root,
.ok-pa-root * {
  box-sizing: border-box;
}
.ok-pa-rule {
  position: absolute;
  inset: 0 0 auto 0;
  height: 12px;
  background: var(--accent);
}
.ok-pa-side {
  position: absolute;
  inset: 0 0 0 auto;
  width: 22%;
  background: #2b5f5b;
}
.ok-pa-grid {
  position: relative;
  display: grid;
  grid-template-columns: 1.25fr 0.75fr;
  grid-template-rows: 1fr auto;
  width: 100%;
  height: 100%;
  gap: 64px;
  padding: 96px;
}
.ok-pa-hero {
  grid-column: 1 / 3;
  align-self: center;
  max-width: 72%;
}
.ok-pa-eyebrow,
.ok-pa-proof-label,
.ok-pa-code-label {
  margin: 0;
  color: var(--accent);
  font-size: 26px;
  font-weight: 720;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.ok-pa-title {
  max-width: 14ch;
  margin: 28px 0 0;
  font-size: 104px;
  font-weight: 760;
  line-height: 1.02;
}
.ok-pa-features {
  display: flex;
  flex-direction: column;
  align-self: end;
  gap: 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ok-pa-feature {
  border-left: 4px solid color-mix(in srgb, #ffffff 24%, transparent);
  background: color-mix(in srgb, #ffffff 7%, transparent);
  padding: 24px 28px;
  font-size: 28px;
  font-weight: 650;
}
.ok-pa-code {
  align-self: end;
  min-height: 196px;
  margin: 0;
  overflow: hidden;
  border: 2px solid color-mix(in srgb, #ffffff 18%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, #000000 52%, transparent);
  padding: 28px;
  color: #b7f7d3;
  font-family: "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
  font-size: 25px;
  line-height: 1.45;
}
.ok-pa-code-label {
  display: block;
  margin-bottom: 16px;
  font-size: 20px;
}
.ok-pa-proof {
  align-self: end;
  justify-self: end;
  min-width: 320px;
  border-top: 2px solid color-mix(in srgb, #ffffff 18%, transparent);
  padding-top: 28px;
  text-align: right;
}
.ok-pa-proof-value {
  display: block;
  margin-top: 12px;
  font-size: 56px;
  line-height: 1;
}
.ok-pa-proof-note {
  display: block;
  margin-top: 12px;
  color: color-mix(in srgb, #ffffff 70%, transparent);
  font-size: 25px;
}
`;

const { registry } = defineRegistry(productAnnouncementCatalog, {
  components: {
    AnnouncementScene: ({ props, children }) => (
      <section
        className="ok-pa-root"
        data-claim={props.claim}
        data-fps={PRODUCT_ANNOUNCEMENT_FPS}
        data-graphic-root
        data-height={PRODUCT_ANNOUNCEMENT_HEIGHT}
        data-mood={props.mood}
        data-product={props.product}
        data-width={PRODUCT_ANNOUNCEMENT_WIDTH}
        style={{ "--accent": props.accent } as CSSProperties}
      >
        <style>{PRODUCT_ANNOUNCEMENT_CSS}</style>
        <div aria-hidden className="ok-pa-rule" />
        <div aria-hidden className="ok-pa-side" />
        <div className="ok-pa-grid">{children}</div>
      </section>
    ),
    CodeSnippet: ({ props }) => (
      <pre
        className="ok-pa-code"
        data-anim="fade,slideUp"
        data-ease="easeOut"
        data-in-dur="12"
        data-in-frame="18"
        data-slide="48"
      >
        <span className="ok-pa-code-label">{props.language}</span>
        <code>{props.code}</code>
      </pre>
    ),
    FeatureStack: ({ props }) => (
      <ul className="ok-pa-features">
        {props.items.map((item, index) => (
          <li
            className="ok-pa-feature"
            data-anim="fade,slideUp"
            data-ease="easeOut"
            data-in-dur="12"
            data-in-frame={String(10 + index * 5)}
            data-slide="42"
            key={`${item}-${index}`}
          >
            {item}
          </li>
        ))}
      </ul>
    ),
    HeroStatement: ({ props }) => (
      <header className="ok-pa-hero">
        <p
          className="ok-pa-eyebrow"
          data-anim="fade,slideUp"
          data-ease="easeOut"
          data-in-dur="10"
          data-in-frame="0"
          data-slide="36"
        >
          {props.eyebrow}
        </p>
        <h1
          className="ok-pa-title"
          data-anim="fade,slideUp"
          data-ease="easeOut"
          data-in-dur="14"
          data-in-frame="5"
          data-slide="62"
        >
          {props.headline}
        </h1>
      </header>
    ),
    ProofPoint: ({ props }) => (
      <aside
        className="ok-pa-proof"
        data-anim="fade,slideUp"
        data-ease="easeOut"
        data-in-dur="12"
        data-in-frame="22"
        data-slide="42"
      >
        <p className="ok-pa-proof-label">{props.label}</p>
        <strong className="ok-pa-proof-value">{props.value}</strong>
        <span className="ok-pa-proof-note">{props.note}</span>
      </aside>
    ),
  },
});

export function ProductAnnouncementFrame({
  spec,
}: {
  spec: ProductAnnouncementSpec;
}) {
  return (
    <JSONUIProvider initialState={{}} registry={registry}>
      <Renderer registry={registry} spec={spec} />
    </JSONUIProvider>
  );
}
