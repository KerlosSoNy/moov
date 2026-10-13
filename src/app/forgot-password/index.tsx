import {
    AuthButton,
    AuthInput,
    AuthMessage,
    AuthScreen,
    AuthSwitch,
} from "@/components/auth/authForm";
import { useTranslation } from "@/i18n/languageProvider";
import { useAuth } from "@/providers/auth";
import { isValidEmail } from "@/services/profile/profile";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";

// The emailed link opens the app on /reset-password with a recovery session
export default function ForgotPasswordScreen() {
    const { t } = useTranslation();
    const { sendPasswordReset } = useAuth();
    const params = useLocalSearchParams<{ email?: string }>();
    const [email, setEmail] = useState(params.email ?? "");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const submit = async () => {
        const trimmed = email.trim();
        if (!isValidEmail(trimmed)) return setError(t("invalidEmail"));

        setLoading(true);
        setError(null);
        setNotice(null);
        try {
            await sendPasswordReset(trimmed);
            // Supabase doesn't reveal whether the account exists, so neither do we
            setNotice(t("resetLinkSent"));
        } catch {
            setError(t("resetLinkFailed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthScreen title={t("forgotPasswordTitle")} subtitle={t("forgotPasswordSubtitle")}>
            <AuthInput
                label={t("email")}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={submit}
            />
            <AuthMessage text={error} tone="error" />
            <AuthMessage text={notice} tone="info" />
            <AuthButton label={t("sendResetLink")} loading={loading} onPress={submit} />
            <AuthSwitch prompt={t("rememberPassword")} action={t("logIn")} href="/login" />
        </AuthScreen>
    );
}
