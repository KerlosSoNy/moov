import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { createURL } from "expo-linking";

export type Profile = {
    name: string;
    email: string;
};

export const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const toProfile = (user: User): Profile => ({
    name: user.user_metadata?.name ?? "",
    email: user.email ?? "",
});

// Uploaded picture, or a generated placeholder until the user sets one
export const avatarUrl = (user: User): string =>
    user.user_metadata?.avatar_url ?? `https://i.pravatar.cc/200?u=${user.id}`;

const AVATAR_BUCKET = "avatars";

export type AvatarFile = { uri: string; mimeType?: string | null };

export async function uploadAvatar(user: User, file: AvatarFile): Promise<void> {
    const contentType = file.mimeType ?? "image/jpeg";
    const ext = contentType.split("/")[1] ?? "jpg";
    // New name per upload so cached copies of the old picture aren't shown
    const path = `${user.id}/${Date.now()}.${ext}`;
    const body = await fetch(file.uri).then((res) => res.arrayBuffer());

    const storage = supabase.storage.from(AVATAR_BUCKET);
    const { error: uploadError } = await storage.upload(path, body, { contentType });
    if (uploadError) throw uploadError;

    const { data } = storage.getPublicUrl(path);
    const { error } = await supabase.auth.updateUser({
        data: { avatar_url: data.publicUrl, avatar_path: path },
    });
    if (error) {
        await storage.remove([path]);
        throw error;
    }

    const previous: string | undefined = user.user_metadata?.avatar_path;
    if (previous) {
        storage.remove([previous]).catch((e) => console.warn("Failed to delete old avatar", e));
    }
}

// Resolves to whether the email change is waiting on confirmation from the new address
export async function saveProfile(user: User, next: Profile): Promise<{ emailPending: boolean }> {
    const emailChanged = next.email !== user.email;
    const { error } = await supabase.auth.updateUser(
        { data: { name: next.name }, ...(emailChanged ? { email: next.email } : {}) },
        { emailRedirectTo: createURL("/login") },
    );
    if (error) throw error;
    return { emailPending: emailChanged };
}

export class WrongPasswordError extends Error {}

export async function changePassword(email: string, current: string, next: string): Promise<void> {
    // Supabase doesn't check the old password on update, so verify it first
    const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
    });
    if (authError) throw new WrongPasswordError();

    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) throw error;
}
