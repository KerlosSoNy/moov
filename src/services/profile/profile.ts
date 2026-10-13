import { CURRENT_USER } from "@/constants/user";
import Storage from "expo-sqlite/kv-store";

export type Profile = {
    name: string;
    email: string;
};

const KEY = "profile";

const DEFAULT_PROFILE: Profile = {
    name: CURRENT_USER.name,
    email: CURRENT_USER.email,
};

export const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function loadProfile(): Profile {
    try {
        const saved = Storage.getItemSync(KEY);
        return saved ? { ...DEFAULT_PROFILE, ...JSON.parse(saved) } : DEFAULT_PROFILE;
    } catch {
        return DEFAULT_PROFILE;
    }
}

// Persisted locally until there is a real auth/user API
export async function saveProfile(profile: Profile): Promise<Profile> {
    await Storage.setItem(KEY, JSON.stringify(profile));
    return profile;
}

// No auth backend yet: passwords are never stored on the device, so this only
// resolves once the request would have been sent
export async function changePassword(_current: string, _next: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 400));
}
