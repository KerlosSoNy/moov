import { contentPath } from "@/lib/contentRoutes";
import { supabase } from "@/lib/supabase";
import type { ContentItem, ContentProvider, ContentType } from "@/types/content";
import * as Notifications from "expo-notifications";
import Storage from "expo-sqlite/kv-store";

export type ScheduleEntry = {
    id: string;
    provider: ContentProvider;
    type: ContentType;
    contentId: string;
    slug: string | null;
    titleAr: string | null;
    titleEn: string | null;
    poster: string | null;
    scheduledAt: Date;
};

type Row = {
    id: string;
    content_provider: ContentProvider;
    content_type: ContentType;
    content_id: string;
    content_slug: string | null;
    title_ar: string | null;
    title_en: string | null;
    poster_url: string | null;
    scheduled_at: string;
};

const COLUMNS = "id, content_provider, content_type, content_id, content_slug, title_ar, title_en, poster_url, scheduled_at";

const toEntry = (row: Row): ScheduleEntry => ({
    id: row.id,
    provider: row.content_provider,
    type: row.content_type,
    contentId: row.content_id,
    slug: row.content_slug,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    poster: row.poster_url,
    scheduledAt: new Date(row.scheduled_at),
});

// Soonest first
export async function fetchSchedule(): Promise<ScheduleEntry[]> {
    const { data, error } = await supabase.from("watch_schedule").select(COLUMNS).order("scheduled_at");
    if (error) throw error;
    return (data as Row[]).map(toEntry);
}

const UNIQUE_VIOLATION = "23505";

// Adds the title, or moves it if it's already scheduled. Not an upsert: on
// conflict PostgREST updates every column sent, but only the time and the
// title snapshot are updatable (the title's identity is fixed)
export async function saveSchedule(item: ContentItem, at: Date): Promise<ScheduleEntry> {
    const changes = {
        content_slug: item.slug,
        title_ar: item.titleAr,
        title_en: item.titleEn ?? (item.titleAr ? null : item.id),
        poster_url: item.poster?.startsWith("https://") ? item.poster : null,
        scheduled_at: at.toISOString(),
    };
    const inserted = await supabase
        .from("watch_schedule")
        .insert({ content_provider: item.provider, content_type: item.type, content_id: item.id, ...changes })
        .select(COLUMNS)
        .single();
    if (!inserted.error) return toEntry(inserted.data as Row);
    if (inserted.error.code !== UNIQUE_VIOLATION) throw inserted.error;

    // Already scheduled: move it (RLS limits this to the user's own row)
    const { data, error } = await supabase
        .from("watch_schedule")
        .update(changes)
        .eq("content_provider", item.provider)
        .eq("content_type", item.type)
        .eq("content_id", item.id)
        .select(COLUMNS)
        .single();
    if (error) throw error;
    return toEntry(data as Row);
}

export async function deleteSchedule(id: string): Promise<void> {
    const { error } = await supabase.from("watch_schedule").delete().eq("id", id);
    if (error) throw error;
}

// ── Reminders ───────────────────────────────────────────────────────────────
// Local notifications on this device, keyed by schedule entry id so moving
// or removing an entry cancels its old reminder.

const REMINDERS_KEY = "schedule:reminders";

async function readReminders(): Promise<Record<string, string>> {
    try {
        const raw = await Storage.getItem(REMINDERS_KEY);
        return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
        return {};
    }
}

const writeReminders = (map: Record<string, string>) =>
    Storage.setItem(REMINDERS_KEY, JSON.stringify(map)).catch(() => {});

export async function hasReminder(entryId: string): Promise<boolean> {
    return !!(await readReminders())[entryId];
}

export async function cancelReminder(entryId: string): Promise<void> {
    const map = await readReminders();
    const notificationId = map[entryId];
    if (!notificationId) return;
    await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => {});
    delete map[entryId];
    await writeReminders(map);
}

// Caller makes sure notification permission is granted
export async function setReminder(
    entry: ScheduleEntry,
    text: { title: string; body: string },
): Promise<void> {
    await cancelReminder(entry.id);
    if (entry.scheduledAt.getTime() <= Date.now()) return;
    const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
            title: text.title,
            body: text.body,
            data: {
                kind: "schedule",
                url: contentPath({ provider: entry.provider, type: entry.type, id: entry.contentId, slug: entry.slug }),
            },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: entry.scheduledAt,
            channelId: "default",
        },
    });
    const map = await readReminders();
    map[entry.id] = notificationId;
    await writeReminders(map);
}

// Reminders belong to the signed-in user; drop them all on sign out
export async function clearAllReminders(): Promise<void> {
    const map = await readReminders();
    await Promise.all(Object.values(map).map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    await Storage.removeItem(REMINDERS_KEY).catch(() => {});
}
