import type { Language } from "@/i18n/config";
import { supabase } from "@/lib/supabase";

export type NotificationPreferences = {
    dailyDiscovery: boolean;
    commentReplies: boolean;
    language: Language;
};

// Same defaults as the table: a user without a row gets these
export const DEFAULT_PREFERENCES: NotificationPreferences = {
    dailyDiscovery: true,
    commentReplies: true,
    language: "en",
};

type Row = { daily_discovery: boolean; comment_replies: boolean; language: Language };

export async function fetchNotificationPreferences(): Promise<NotificationPreferences | null> {
    const { data, error } = await supabase
        .from("notification_preferences")
        .select("daily_discovery, comment_replies, language")
        .maybeSingle();
    if (error) throw error;
    const row = data as Row | null;
    return row
        ? { dailyDiscovery: row.daily_discovery, commentReplies: row.comment_replies, language: row.language }
        : null;
}

export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
    const { error } = await supabase.from("notification_preferences").upsert(
        { daily_discovery: prefs.dailyDiscovery, comment_replies: prefs.commentReplies, language: prefs.language },
        { onConflict: "user_id" },
    );
    if (error) throw error;
}
