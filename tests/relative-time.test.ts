import { expect, test } from "bun:test";
import {
  relativeTimeAgo,
  relativeTimeShort,
} from "../web/lib/relative-time.ts";

test("relativeTimeAgo formats recent timestamps", () => {
  const now = Date.UTC(2026, 5, 28, 12, 0, 0);
  expect(relativeTimeAgo(now - 30_000, now)).toBe("just now");
  expect(relativeTimeAgo(now - 5 * 60_000, now)).toBe("5m ago");
  expect(relativeTimeAgo(now - 3 * 60 * 60_000, now)).toBe("3h ago");
  expect(relativeTimeAgo(now - 2 * 24 * 60 * 60_000, now)).toBe("2d ago");
});

test("relativeTimeShort formats compact labels", () => {
  const now = Date.UTC(2026, 5, 28, 12, 0, 0);
  expect(relativeTimeShort(now - 30_000, now)).toBe("now");
  expect(relativeTimeShort(now - 5 * 60_000, now)).toBe("5m");
  expect(relativeTimeShort(now - 3 * 60 * 60_000, now)).toBe("3h");
  expect(relativeTimeShort(now - 2 * 24 * 60 * 60_000, now)).toBe("2d");
});
