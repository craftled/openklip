import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IngesterSchema,
  loadIngesters,
  resolveIngesterArgv,
} from "../src/ingesters.ts";

const URL_INGESTER = {
  id: "url",
  label: "Download from URL",
  command: "yt-dlp",
  args: ["{url}", "-o", "{output}"],
  fields: [{ name: "url", required: true }],
};

test("IngesterSchema parses a manifest and defaults field types", () => {
  const m = IngesterSchema.parse(URL_INGESTER);
  assert.equal(m.id, "url");
  assert.equal(m.fields[0]?.type, "string");
  assert.equal(m.fields[0]?.required, true);
});

test("loadIngesters discovers bundled manifests", async () => {
  const list = await loadIngesters();
  assert.ok(Array.isArray(list));
  assert.ok(list.some((m) => m.id === "url"));
});

test("resolveIngesterArgv substitutes field and {output} placeholders", () => {
  const m = IngesterSchema.parse(URL_INGESTER);
  const argv = resolveIngesterArgv(
    m,
    { url: "https://example.com/v.mp4" },
    "/tmp/out.mp4"
  );
  assert.deepEqual(argv, [
    "yt-dlp",
    "https://example.com/v.mp4",
    "-o",
    "/tmp/out.mp4",
  ]);
});

test("resolveIngesterArgv throws when a required field is missing", () => {
  const m = IngesterSchema.parse(URL_INGESTER);
  assert.throws(
    () => resolveIngesterArgv(m, {}, "/tmp/out.mp4"),
    /required field "url"/i
  );
});
