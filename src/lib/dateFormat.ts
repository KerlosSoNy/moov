const locale = (language: string) => (language === "ar" ? "ar-EG" : "en-US");

// "Fri, Oct 20" / "الجمعة، ٢٠ أكتوبر" (year added when it isn't this year)
export function formatDay(date: Date, language: string): string {
    return date.toLocaleDateString(locale(language), {
        weekday: "short",
        month: "short",
        day: "numeric",
        ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
    });
}

// "8:30 PM" / "٨:٣٠ م"
export function formatTime(date: Date, language: string): string {
    return date.toLocaleTimeString(locale(language), { hour: "numeric", minute: "2-digit" });
}

export const formatDayTime = (date: Date, language: string) => `${formatDay(date, language)} · ${formatTime(date, language)}`;

// Today at 20:00, or tomorrow if that has passed: a sensible movie-night default
export function defaultScheduleTime(now = new Date()): Date {
    const at = new Date(now);
    at.setHours(20, 0, 0, 0);
    if (at.getTime() - now.getTime() < 15 * 60_000) at.setDate(at.getDate() + 1);
    return at;
}
