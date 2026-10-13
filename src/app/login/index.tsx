import {
    AuthButton,
    AuthInput,
    AuthLink,
    AuthMessage,
    AuthScreen,
    AuthSwitch
} from "@/components/auth/authForm";
import { useTranslation } from "@/i18n/languageProvider";
import { useAuth } from "@/providers/auth";
import { isValidEmail } from "@/services/profile/profile";
import { useState } from "react";

// On success the auth guard in the root layout moves the user into the app
export default function LoginScreen() {
    const { t }: any = useTranslation();
    const { signIn } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        const trimmed = email.trim();
        if (!isValidEmail(trimmed)) return setError(t("invalidEmail"));
        if (!password) return setError(t("passwordRequired"));

        setLoading(true);
        setError(null);
        try {
            await signIn(trimmed, password);
        } catch {
            setError(t("loginFailed"));
            setLoading(false);
        }
    };

    return (
        <AuthScreen title={t("welcomeBack")} subtitle={t("loginSubtitle")}>
            <AuthInput
                label={t("email")}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
            />
            <AuthInput
                label={t("password")}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={submit}
            />
            <AuthLink
                label={t("forgotPassword")}
                href={{ pathname: "/forgot-password", params: { email: email.trim() } }}
            />
            <AuthMessage text={error} tone="error" />
            <AuthButton label={t("logIn")} loading={loading} onPress={submit} />
            <AuthSwitch prompt={t("noAccount")} action={t("signUp")} href="/signup" />
        </AuthScreen>
    );
}
