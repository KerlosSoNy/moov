import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultScheduleTime } from "../../src/lib/dateFormat.ts";

test("defaults to 8 PM today, or tomorrow once that's under 15 minutes away", () => {
    const morning = new Date(2026, 9, 14, 10, 0);
    assert.deepEqual(defaultScheduleTime(morning), new Date(2026, 9, 14, 20, 0));
    const late = new Date(2026, 9, 14, 19, 50);
    assert.deepEqual(defaultScheduleTime(late), new Date(2026, 9, 15, 20, 0));
    const endOfMonth = new Date(2026, 9, 31, 22, 0);
    assert.deepEqual(defaultScheduleTime(endOfMonth), new Date(2026, 10, 1, 20, 0));
});
