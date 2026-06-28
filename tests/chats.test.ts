import assert from "node:assert/strict";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  appendProjectMessage,
  createProjectThread,
  getActiveProjectThreadId,
  listProjectThreads,
  loadProjectChats,
  resetChatIdSequenceForTests,
  saveProjectChats,
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

test("saveProjectChats writes atomically: no tmp file left behind", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    resetChatIdSequenceForTests();
    writeFixtureProject(slug, makeProject({ slug }));

    const thread = await createProjectThread(slug, "Atomic");
    await saveProjectChats(slug, {
      activeThreadId: thread.id,
      threads: [thread],
    });

    const workingDir = join(root, "projects", slug, "working");
    const entries = readdirSync(workingDir).filter(
      (f) => f.startsWith("chats.json") && f !== "chats.json"
    );
    assert.deepEqual(entries, [], "no tmp/bad chats files should remain");
  });
});

test("corrupt chats.json is backed up and surfaces an error instead of wiping", async () => {
  await withTempProjectsRoot(async ({ slug, root }) => {
    writeFixtureProject(slug, makeProject({ slug }));
    const workingDir = join(root, "projects", slug, "working");
    writeFileSync(join(workingDir, "chats.json"), "{not valid json");

    // loadProjectChats must reject (not silently return empty), otherwise the
    // next mutation would persist {} and destroy the history.
    await assert.rejects(loadProjectChats(slug), /corrupt/i);

    const backups = readdirSync(workingDir).filter((f) =>
      f.startsWith("chats.json.bad-")
    );
    assert.equal(backups.length, 1, "corrupt file should be backed up");

    // After the bad file is moved aside, the project recovers: a new thread
    // can be created fresh.
    const thread = await createProjectThread(slug, "Recovery");
    assert.equal(thread.title, "Recovery");
    const reloaded = await loadProjectChats(slug);
    assert.equal(reloaded.threads.length, 1);
  });
});
