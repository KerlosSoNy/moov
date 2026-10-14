// Device side of push notifications: permission, Expo push token, and
// registering that token with Supabase (register_push_token RPC). Sending is
// done server side by the notifications-dispatch Edge Function.
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Storage from "expo-sqlite/kv-store";
import { Platform } from "react-native";

export type PushPermission = "granted" | "denied" | "undetermined" | "unsupported";

const ANDROID_CHANNEL = "default";
const REGISTRATION_KEY = "push:registration";
// Re-register a known token at most daily, just to refresh last_seen_at
const REFRESH_MS = 24 * 60 * 60 * 1000;

type Registration = { token: string; userId: string; at: number };

// Show notifications that arrive while the app is open
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
    }),
});

// Push needs a physical device; web is not set up for push
export const pushSupported = Platform.OS !== "web" && Device.isDevice;

// Android 13+ shows the permission prompt only once a channel exists
async function ensureChannel() {
    if (Platform.OS !== "android") return;
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
        name: "Moov",
        importance: Notifications.AndroidImportance.DEFAULT,
    });
}

const toPermission = (status: Notifications.NotificationPermissionsStatus): PushPermission => {
    // iOS reports the real state (including provisional) under ios.status
    if (Platform.OS === "ios" && status.ios) {
        const ios = status.ios.status;
        if (
            ios === Notifications.IosAuthorizationStatus.AUTHORIZED ||
            ios === Notifications.IosAuthorizationStatus.PROVISIONAL ||
            ios === Notifications.IosAuthorizationStatus.EPHEMERAL
        ) {
            return "granted";
        }
        return ios === Notifications.IosAuthorizationStatus.DENIED ? "denied" : "undetermined";
    }
    if (status.granted) return "granted";
    return status.canAskAgain ? "undetermined" : "denied";
};

export async function getPushPermission(): Promise<PushPermission> {
    if (!pushSupported) return "unsupported";
    return toPermission(await Notifications.getPermissionsAsync());
}

// Shows the OS prompt. Only call from an explicit user action.
export async function requestPushPermission(): Promise<PushPermission> {
    if (!pushSupported) return "unsupported";
    await ensureChannel();
    return toPermission(await Notifications.requestPermissionsAsync());
}

async function getExpoToken(): Promise<string | null> {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
        console.warn("Missing EAS projectId; push notifications are disabled");
        return null;
    }
    await ensureChannel();
    try {
        return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (error) {
        // Offline, Expo Go on Android, or missing push credentials
        console.warn("Couldn't get an Expo push token", error);
        return null;
    }
}

async function readRegistration(): Promise<Registration | null> {
    try {
        const raw = await Storage.getItem(REGISTRATION_KEY);
        return raw ? (JSON.parse(raw) as Registration) : null;
    } catch {
        return null;
    }
}

// Registers this device for `userId` when permission is granted. Skips the
// request when the same token was registered for the same user recently, so
// app launches don't spam the backend. `token` comes from the rotation listener.
export async function syncPushToken(userId: string, token?: string): Promise<boolean> {
    if ((await getPushPermission()) !== "granted") return false;
    const current = token ?? (await getExpoToken());
    if (!current) return false;

    const previous = await readRegistration();
    if (previous?.token === current && previous.userId === userId && Date.now() - previous.at < REFRESH_MS) {
        return true;
    }
    const { error } = await supabase.rpc("register_push_token", {
        p_token: current,
        p_platform: Platform.OS,
    });
    if (error) throw error;
    // A rotated token replaces the old one, which is retired server side
    if (previous && previous.token !== current && previous.userId === userId) {
        await supabase.rpc("unregister_push_token", { p_token: previous.token, p_reason: "logout" });
    }
    await Storage.setItem(REGISTRATION_KEY, JSON.stringify({ token: current, userId, at: Date.now() } satisfies Registration));
    return true;
}

// Stops pushes to this device for the signed-in user. Must run while the
// session is still valid (before signOut). Never throws: signing out must not
// depend on the network.
export async function unregisterDevice(reason: "logout" | "permission_denied" = "logout"): Promise<void> {
    const registration = await readRegistration();
    if (!registration) return;
    try {
        const { error } = await supabase.rpc("unregister_push_token", { p_token: registration.token, p_reason: reason });
        if (error) throw error;
    } catch (error) {
        console.warn("Couldn't unregister push token", error);
    } finally {
        await Storage.removeItem(REGISTRATION_KEY).catch(() => {});
    }
}

// Notification taps carry an in-app path in data.url (see the dispatcher).
// Only relative app paths are followed.
export function notificationUrl(response: Notifications.NotificationResponse | null | undefined): string | null {
    const url = response?.notification.request.content.data?.url;
    return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : null;
}
