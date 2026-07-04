import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LoadingPage from "../app/loading.tsx";
import { HelloLoading } from "../web/components/hello-loading.tsx";
import { ProjectLoading } from "../web/components/project-loading.tsx";

test("HelloLoading renders status region, hello svg, and contextual label", () => {
  const html = renderToStaticMarkup(
    createElement(HelloLoading, { context: "project" })
  );

  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /data-hello-loading=""/);
  assert.match(html, /data-hello-loading-context="project"/);
  assert.match(html, /<title>hello<\/title>/);
  assert.match(html, /Loading project…/);
});

test("HelloLoading compact chat context uses smaller layout hook", () => {
  const html = renderToStaticMarkup(
    createElement(HelloLoading, { context: "chats", size: "compact" })
  );

  assert.match(html, /data-hello-loading-context="chats"/);
  assert.match(html, /Loading chats…/);
  assert.match(html, /h-8/);
});

test("HelloLoading fullScreen fills the viewport shell", () => {
  const html = renderToStaticMarkup(
    createElement(HelloLoading, { context: "project", fullScreen: true })
  );

  assert.match(html, /h-screen/);
});

test("ProjectLoading is the main project loading screen", () => {
  const html = renderToStaticMarkup(createElement(ProjectLoading));

  assert.match(html, /data-hello-loading-context="project"/);
  assert.match(html, /Loading project…/);
  assert.match(html, /h-screen/);
});

test("app loading route renders ProjectLoading", () => {
  const html = renderToStaticMarkup(createElement(LoadingPage));

  assert.match(html, /data-hello-loading-context="project"/);
  assert.match(html, /Loading project…/);
});
