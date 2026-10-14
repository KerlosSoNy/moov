import type { TranslationKey } from "@/i18n/config";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "now", "5m", "3h", "2d", then a calendar date. Hand-rolled because Hermes'
// Intl.RelativeTimeFormat support varies by platform.
export function relativeTime(
    iso: string,
    t: (key: TranslationKey) => string,
    language: string,
    now = Date.now(),
): string {
    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) return "";
    const elapsed = Math.max(0, now - time);
    const fill = (key: TranslationKey, n: number) => t(key).replace("{n}", String(n));
    if (elapsed < MINUTE) return t("timeJustNow");
    if (elapsed < HOUR) return fill("timeMinutesAgo", Math.floor(elapsed / MINUTE));
    if (elapsed < DAY) return fill("timeHoursAgo", Math.floor(elapsed / HOUR));
    if (elapsed < 7 * DAY) return fill("timeDaysAgo", Math.floor(elapsed / DAY));
    return new Date(time).toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}
