import { useTranslation } from "@/i18n/languageProvider";
import { useAuth } from "@/providers/auth";
import {
    getPushPermission,
    notificationUrl,
    requestPushPermission,
    syncPushToken,
    unregisterDevice,
    type PushPermission,
} from "@/services/notifications/pushNotifications";
import {
    DEFAULT_PREFERENCES,
    fetchNotificationPreferences,
    saveNotificationPreferences,
    type NotificationPreferences,
} from "@/services/notifications/preferences";
import * as Notifications from "expo-notifications";
import { router, usePathname, type Href } from "expo-router";
import Storage from "expo-sqlite/kv-store";
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";

const PROMPT_DISMISSED_KEY = "push:promptDismissed";

type Notifs = {
    permission: PushPermission | null;
    // Server preferences; null until loaded for the signed-in user
    preferences: NotificationPreferences | null;
    updatePreferences: (patch: Partial<NotificationPreferences>) => Promise<void>;
    // Asks the OS (from a user action), then registers this device
    enable: () => Promise<PushPermission>;
    promptDismissed: boolean;
    dismissPrompt: () => void;
};

const NotificationsContext = createContext<Notifs | null>(null);

const readDismissed = () => {
    try {
        return Storage.getItemSync(PROMPT_DISMISSED_KEY) === "1";
    } catch {
        return false;
    }
};

export function NotificationsProvider({ children }: { children: ReactNode }) {
    const { user, recovering } = useAuth();
    const userId = user?.id;
    const { language } = useTranslation();
    const [permission, setPermission] = useState<PushPermission | null>(null);
    const [prefs, setPrefs] = useState<{ owner: string; value: NotificationPreferences } | null>(null);
    const [promptDismissed, setPromptDismissed] = useState(readDismissed);
    const preferences = prefs && prefs.owner === userId ? prefs.value : null;

    // Permission can change in system settings while the app is backgrounded
    useEffect(() => {
        const refresh = () => getPushPermission().then(setPermission).catch(() => setPermission("unsupported"));
        refresh();
        const sub = AppState.addEventListener("change", (state) => state === "active" && refresh());
        return () => sub.remove();
    }, []);

    // Already-granted devices register silently on sign-in; nobody is prompted here
    useEffect(() => {
        if (!userId || permission !== "granted") return;
        syncPushToken(userId).catch((e) => console.warn("Push registration failed", e));
        const sub = Notifications.addPushTokenListener(({ data }) => {
            // The listener reports the native token; ask Expo for the matching Expo token
            if (data) syncPushToken(userId).catch((e) => console.warn("Push token refresh failed", e));
        });
        return () => sub.remove();
    }, [userId, permission]);

    useEffect(() => {
        if (!userId) return;
        let stale = false;
        fetchNotificationPreferences()
            .then((value) => !stale && setPrefs({ owner: userId, value: value ?? { ...DEFAULT_PREFERENCES, language } }))
            .catch((e) => console.warn("Couldn't load notification preferences", e));
        return () => {
            stale = true;
        };
        // language only seeds a missing row; changes are synced below
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    const updatePreferences = useCallback(
        async (patch: Partial<NotificationPreferences>) => {
            if (!userId || !preferences) return;
            const next = { ...preferences, ...patch };
            setPrefs({ owner: userId, value: next });
            try {
                await saveNotificationPreferences(next);
            } catch (e) {
                setPrefs({ owner: userId, value: preferences });
                throw e;
            }
        },
        [userId, preferences],
    );

    // Notifications follow the app language: push the change to the server,
    // then record it locally once saved
    useEffect(() => {
        if (!userId || !preferences || preferences.language === language) return;
        const next = { ...preferences, language };
        saveNotificationPreferences(next)
            .then(() => setPrefs((p) => (p?.owner === userId ? { owner: userId, value: { ...p.value, language } } : p)))
            .catch((e) => console.warn("Couldn't sync notification language", e));
    }, [language, userId, preferences]);

    const enable = async () => {
        const result = await requestPushPermission();
        setPermission(result);
        if (result === "granted" && userId) {
            await syncPushToken(userId);
        } else if (result === "denied") {
            await unregisterDevice("permission_denied");
        }
        return result;
    };

    const dismissPrompt = () => {
        setPromptDismissed(true);
        Storage.setItem(PROMPT_DISMISSED_KEY, "1").catch(() => {});
    };

    return (
        <NotificationsContext
            value={{ permission, preferences, updatePreferences, enable, promptDismissed, dismissPrompt }}
        >
            <NotificationRouter signedIn={!!userId && !recovering} />
            {children}
        </NotificationsContext>
    );
}

// Opens the screen a tapped notification points to. A tap that launches the
// app is held until the user is signed in and past the splash screen.
function NotificationRouter({ signedIn }: { signedIn: boolean }) {
    const response = Notifications.useLastNotificationResponse();
    const pathname = usePathname();
    const handled = useRef<string | null>(null);
    const id = response?.notification.request.identifier ?? null;
    // Remote pushes and local watch reminders both carry data.url
    const url = notificationUrl(response);
    const ready = signedIn && pathname !== "/";

    useEffect(() => {
        if (!url || !id || id === handled.current || !ready) return;
        if (response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
        handled.current = id;
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
        router.push(url as Href);
    }, [url, id, ready, response]);

    return null;
}

export function useNotifications() {
    const ctx = use(NotificationsContext);
    if (!ctx) {
        throw new Error("useNotifications must be used inside NotificationsProvider");
    }
    return ctx;
}
