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
import { useState } from "react";

const MIN_PASSWORD_LENGTH = 8;

export default function SignupScreen() {
    const { t } = useTranslation();
    const { signUp } = useAuth();
    const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const set = (key: keyof typeof form) => (value: string) =>
        setForm((f) => ({ ...f, [key]: value }));

    const submit = async () => {
        const name = form.name.trim();
        const email = form.email.trim();
        if (!name) return setError(t("nameRequired"));
        if (!isValidEmail(email)) return setError(t("invalidEmail"));
        if (form.password.length < MIN_PASSWORD_LENGTH) return setError(t("passwordTooShort"));
        if (form.password !== form.confirm) return setError(t("passwordMismatch"));

        setLoading(true);
        setError(null);
        setNotice(null);
        try {
            const { needsConfirmation } = await signUp(name, email, form.password);
            // Without confirmation the auth guard moves the user into the app
            if (needsConfirmation) {
                setNotice(t("checkEmail"));
                setLoading(false);
            }
        } catch {
            setError(t("signupFailed"));
            setLoading(false);
        }
    };

    return (
        <AuthScreen title={t("createAccount")} subtitle={t("signupSubtitle")}>
            <AuthInput
                label={t("name")}
                value={form.name}
                onChangeText={set("name")}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
            />
            <AuthInput
                label={t("email")}
                value={form.email}
                onChangeText={set("email")}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
            />
            <AuthInput
                label={t("password")}
                value={form.password}
                onChangeText={set("password")}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
            />
            <AuthInput
                label={t("repeatPassword")}
                value={form.confirm}
                onChangeText={set("confirm")}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={submit}
            />
            <AuthMessage text={error} tone="error" />
            <AuthMessage text={notice} tone="info" />
            <AuthButton label={t("signUp")} loading={loading} onPress={submit} />
            <AuthSwitch prompt={t("haveAccount")} action={t("logIn")} href="/login" />
        </AuthScreen>
    );
}
