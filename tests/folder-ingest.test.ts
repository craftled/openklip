import assert from "node:assert/strict";
import { test } from "node:test";
import { planFolderIntake } from "../src/folder-ingest.ts";
import {
  assertUploadSize,
  MAX_PROJECT_UPLOAD_BYTES,
  uploadTooLargeMessage,
} from "../src/upload-limits.ts";

test("planFolderIntake picks the largest supported video as primary", () => {
  const result = planFolderIntake([
    { name: "clip-a.mp4", size: 100 },
    { name: "clip-b.mp4", size: 500 },
    { name: "photo.jpg", size: 50 },
  ]);
  assert.ok("plan" in result);
  if (!("plan" in result)) {
    return;
  }
  assert.equal(result.plan.primary.name, "clip-b.mp4");
  assert.deepEqual(
    result.plan.assets.map((asset) => asset.name),
    ["clip-a.mp4", "photo.jpg"]
  );
});

test("uploadTooLargeMessage reports gigabyte sizes", () => {
  const message = uploadTooLargeMessage(
    "Upload",
    MAX_PROJECT_UPLOAD_BYTES + 1,
    MAX_PROJECT_UPLOAD_BYTES
  );
  assert.match(message, /Upload is/);
  assert.match(message, /limit is/);
});

test("assertUploadSize throws over the cap", () => {
  assert.throws(
    () =>
      assertUploadSize(
        MAX_PROJECT_UPLOAD_BYTES + 1,
        MAX_PROJECT_UPLOAD_BYTES,
        "Upload"
      ),
    /Upload is/
  );
});
