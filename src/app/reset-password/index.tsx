import { AuthButton, AuthInput, AuthMessage, AuthScreen } from "@/components/auth/authForm";
import { useTranslation } from "@/i18n/languageProvider";
import { useAuth } from "@/providers/auth";
import { useState } from "react";

const MIN_PASSWORD_LENGTH = 8;

// Reached from a password reset email; on success the auth guard moves the user into the app
export default function ResetPasswordScreen() {
    const { t } = useTranslation();
    const { updatePassword } = useAuth();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (password.length < MIN_PASSWORD_LENGTH) return setError(t("passwordTooShort"));
        if (password !== confirm) return setError(t("passwordMismatch"));

        setLoading(true);
        setError(null);
        try {
            await updatePassword(password);
        } catch {
            setError(t("passwordUpdateFailed"));
            setLoading(false);
        }
    };

    return (
        <AuthScreen title={t("newPasswordTitle")} subtitle={t("newPasswordSubtitle")}>
            <AuthInput
                label={t("newPassword")}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
            />
            <AuthInput
                label={t("confirmPassword")}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={submit}
            />
            <AuthMessage text={error} tone="error" />
            <AuthButton label={t("updatePassword")} loading={loading} onPress={submit} />
        </AuthScreen>
    );
}
