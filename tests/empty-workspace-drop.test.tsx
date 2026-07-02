import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyWorkspaceMain } from "../web/components/empty-workspace-main.tsx";

test("folder-ready empty workspace advertises the drop target", () => {
  const html = renderToStaticMarkup(
    <EmptyWorkspaceMain
      dialogOpen={false}
      dropActive={false}
      folderReady
      inboxJobs={[]}
      onOpenDialog={() => undefined}
    />
  );
  assert.match(html, /data-drop-target="empty-workspace"/);
  assert.match(html, /[Dd]rop a video/);
});

test("drop-active empty workspace shows the drag highlight treatment", () => {
  const html = renderToStaticMarkup(
    <EmptyWorkspaceMain
      dialogOpen={false}
      dropActive
      folderReady
      inboxJobs={[]}
      onOpenDialog={() => undefined}
    />
  );
  assert.match(html, /data-drop-active/);
  assert.match(html, /border-primary/);
  assert.match(html, /bg-primary\/10/);
});

test("empty workspace without a chosen folder does not advertise dropping", () => {
  const html = renderToStaticMarkup(
    <EmptyWorkspaceMain
      dialogOpen={false}
      dropActive={false}
      folderReady={false}
      inboxJobs={[]}
      onOpenDialog={() => undefined}
    />
  );
  assert.doesNotMatch(html, /[Dd]rop a video/);
});
