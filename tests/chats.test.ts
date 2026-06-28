import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendProjectMessage,
  createProjectThread,
  getActiveProjectThreadId,
  listProjectThreads,
  loadProjectChats,
  resetChatIdSequenceForTests,
  setActiveProjectThreadId,
} from "../src/chats.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

test("chats persist under working/chats.json per project", async () => {
  await withTempProjectsRoot(async ({ slug }) => {
    resetChatIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));

    const thread = await createProjectThread(slug, "Test chat");
    await setActiveProjectThreadId(slug, thread.id);
    await appendProjectMessage(slug, thread.id, "user", "hello");

    const reloaded = await loadProjectChats(slug);
    assert.equal(reloaded.threads.length, 1);
    assert.equal(reloaded.activeThreadId, thread.id);
    assert.equal(reloaded.threads[0]?.messages[0]?.content, "hello");

    const listed = await listProjectThreads(slug);
    assert.equal(listed.length, 1);
    assert.equal(await getActiveProjectThreadId(slug), thread.id);
  });
});
