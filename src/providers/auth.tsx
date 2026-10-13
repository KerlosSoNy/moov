import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { createURL, useLinkingURL } from "expo-linking";
import { createContext, use, useEffect, useState, type ReactNode } from "react";

type SignUpResult = { needsConfirmation: boolean };

type Auth = {
    user: User | null;
    // True until the stored session has been read on launch
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (name: string, email: string, password: string) => Promise<SignUpResult>;
    signOut: () => Promise<void>;
    // True after opening a password reset link, until a new password is set
    recovering: boolean;
    sendPasswordReset: (email: string) => Promise<void>;
    updatePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

// Where Supabase email links (signup confirmation, email change) send the user back.
// moov://login in builds, exp://<host>/--/login in Expo Go; both must be allowed
// under Authentication → URL Configuration → Redirect URLs in Supabase
const EMAIL_REDIRECT = createURL("/login");
const RESET_REDIRECT = createURL("/reset-password");

// Supabase puts the session in the URL fragment: #access_token=…&refresh_token=…&type=…
function sessionFromUrl(url: string) {
    const fragment = url.split("#")[1];
    if (!fragment) return null;
    const params = new URLSearchParams(fragment);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return null;
    return { session: { access_token, refresh_token }, recovery: params.get("type") === "recovery" };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const linkingUrl = useLinkingURL();
    // A reset link puts the app in recovery mode until a new password is set (or the link fails),
    // so the guard shows the new password screen instead of home
    const [finishedRecoveryUrl, setFinishedRecoveryUrl] = useState<string | null>(null);
    const link = linkingUrl ? sessionFromUrl(linkingUrl) : null;
    const recovering = !!link?.recovery && linkingUrl !== finishedRecoveryUrl;

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setUser(data.session?.user ?? null);
            setLoading(false);
        });
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });
        return () => data.subscription.unsubscribe();
    }, []);

    // Opening an email link signs the user in; onAuthStateChange picks it up
    useEffect(() => {
        const link = linkingUrl && sessionFromUrl(linkingUrl);
        if (!link) return;
        supabase.auth.setSession(link.session).then(({ error }) => {
            if (!error) return;
            console.error("Failed to sign in from email link", error);
            setFinishedRecoveryUrl(linkingUrl);
        });
    }, [linkingUrl]);

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    };

    const signUp = async (name: string, email: string, password: string) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { name }, emailRedirectTo: EMAIL_REDIRECT },
        });
        if (error) throw error;
        // With email confirmation on, Supabase returns no session until the link is opened
        return { needsConfirmation: !data.session };
    };

    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    };

    const sendPasswordReset = async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: RESET_REDIRECT,
        });
        if (error) throw error;
    };

    const updatePassword = async (password: string) => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setFinishedRecoveryUrl(linkingUrl);
    };

    return (
        <AuthContext
            value={{
                user,
                loading,
                signIn,
                signUp,
                signOut,
                recovering,
                sendPasswordReset,
                updatePassword,
            }}
        >
            {children}
        </AuthContext>
    );
}

export function useAuth() {
    const ctx = use(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used inside AuthProvider");
    }
    return ctx;
}

// For screens behind the auth guard, where a user always exists
export function useUser() {
    const { user } = useAuth();
    if (!user) {
        throw new Error("useUser must be used on a signed-in screen");
    }
    return user;
}
