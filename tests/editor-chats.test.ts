import { describe, expect, test } from "bun:test";
import {
  createProjectThread,
  loadProjectChats,
  setActiveProjectThreadId,
} from "@engine/chats";
import { loadEditorChats } from "../app/lib/editor-chats.ts";
import {
  makeProject,
  withTempProjectsRoot,
  writeFixtureProject,
} from "./helpers/projectFixture.ts";

describe("loadEditorChats", () => {
  test("creates a thread and sets active when chats are empty", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));

      const snapshot = await loadEditorChats(slug);

      expect(snapshot.threads).toHaveLength(1);
      expect(snapshot.archived).toHaveLength(0);
      expect(snapshot.activeThreadId).toBe(snapshot.threads[0]?.id);

      const stored = await loadProjectChats(slug);
      expect(stored.threads).toHaveLength(1);
      expect(stored.activeThreadId).toBe(snapshot.activeThreadId);
    });
  });

  test("repairs missing active thread id", async () => {
    await withTempProjectsRoot(async ({ slug }) => {
      writeFixtureProject(slug, makeProject({ slug }));
      const thread = await createProjectThread(slug, "Repair me");
      await setActiveProjectThreadId(slug, "missing-thread");

      const snapshot = await loadEditorChats(slug);

      expect(snapshot.activeThreadId).toBe(thread.id);
      expect(snapshot.threads.some((t) => t.id === thread.id)).toBe(true);
    });
  });
});
