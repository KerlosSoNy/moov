import assert from "node:assert/strict";
import { test } from "node:test";
import { relativeTime } from "../../src/lib/relativeTime.ts";

const strings: Record<string, string> = { timeJustNow: "now", timeMinutesAgo: "{n}m", timeHoursAgo: "{n}h", timeDaysAgo: "{n}d" };
const t = (key: string) => strings[key] ?? key;
const now = Date.parse("2026-10-14T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

test("formats recent times compactly", () => {
    assert.equal(relativeTime(ago(10_000), t, "en", now), "now");
    assert.equal(relativeTime(ago(5 * 60_000), t, "en", now), "5m");
    assert.equal(relativeTime(ago(3 * 3_600_000), t, "en", now), "3h");
    assert.equal(relativeTime(ago(2 * 86_400_000), t, "en", now), "2d");
});

test("falls back to a date after a week, and tolerates bad input and clock skew", () => {
    assert.match(relativeTime(ago(30 * 86_400_000), t, "en", now), /2026/);
    assert.equal(relativeTime("not a date", t, "en", now), "");
    assert.equal(relativeTime(new Date(now + 60_000).toISOString(), t, "en", now), "now");
});
