import { EditableField, EditableSection } from "@/components/profile/editableSection";
import type { Colors } from "@/constants/theme";
import { CURRENT_USER } from "@/constants/user";
import { useTheme } from "@/hooks/useTheme";
import type { TranslationKey } from "@/i18n/config";
import { useTranslation } from "@/i18n/languageProvider";
import {
    changePassword,
    isValidEmail,
    loadProfile,
    saveProfile,
    type Profile,
} from "@/services/profile/profile";
import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type LinkItem = {
    label: TranslationKey;
    icon: keyof typeof Feather.glyphMap;
    href: Href;
};

const LINKS: LinkItem[] = [
    { label: "favorites", icon: "heart", href: "/favorite" },
    { label: "settings", icon: "settings", href: "/settings" },
];

const MIN_PASSWORD_LENGTH = 8;
const EMPTY_PASSWORDS = { current: "", next: "", confirm: "" };

export default function ProfileScreen() {
    const insets = useSafeAreaInsets();
    const { t, isRTL } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);

    const [profile, setProfile] = useState<Profile>(loadProfile);
    const [draft, setDraft] = useState<Profile>(profile);
    const [editingInfo, setEditingInfo] = useState(false);
    const [savingInfo, setSavingInfo] = useState(false);
    const [infoError, setInfoError] = useState<string | null>(null);

    const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
    const [editingPassword, setEditingPassword] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const startEditInfo = () => {
        setDraft(profile);
        setInfoError(null);
        setEditingInfo(true);
    };

    const cancelEditInfo = () => {
        setDraft(profile);
        setInfoError(null);
        setEditingInfo(false);
    };

    const saveInfo = async () => {
        const next = { name: draft.name.trim(), email: draft.email.trim() };
        if (!next.name) return setInfoError(t("nameRequired"));
        if (!isValidEmail(next.email)) return setInfoError(t("invalidEmail"));

        setSavingInfo(true);
        try {
            setProfile(await saveProfile(next));
            setEditingInfo(false);
            setInfoError(null);
        } catch {
            setInfoError(t("saveFailed"));
        } finally {
            setSavingInfo(false);
        }
    };

    const startEditPassword = () => {
        setPasswords(EMPTY_PASSWORDS);
        setPasswordError(null);
        setEditingPassword(true);
    };

    const cancelEditPassword = () => {
        setPasswords(EMPTY_PASSWORDS);
        setPasswordError(null);
        setEditingPassword(false);
    };

    const savePassword = async () => {
        if (!passwords.current) return setPasswordError(t("passwordRequired"));
        if (passwords.next.length < MIN_PASSWORD_LENGTH) {
            return setPasswordError(t("passwordTooShort"));
        }
        if (passwords.next !== passwords.confirm) {
            return setPasswordError(t("passwordMismatch"));
        }

        setSavingPassword(true);
        try {
            await changePassword(passwords.current, passwords.next);
            cancelEditPassword();
            Alert.alert(t("passwordChanged"));
        } catch {
            setPasswordError(t("saveFailed"));
        } finally {
            setSavingPassword(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                    paddingTop: insets.top + 8,
                    paddingBottom: 120,
                }}
            >
                <Pressable
                    onPress={() => router.back()}
                    style={styles.back}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t("back")}
                >
                    <Feather
                        name={isRTL ? "chevron-right" : "chevron-left"}
                        size={22}
                        color={colors.text}
                    />
                </Pressable>

                <View style={styles.hero}>
                    <Image
                        source={{ uri: CURRENT_USER.avatar }}
                        style={styles.avatar}
                        contentFit="cover"
                        transition={200}
                    />
                    <Text style={styles.name} numberOfLines={1}>
                        {profile.name}
                    </Text>
                    <Text style={styles.email} numberOfLines={1}>
                        {profile.email}
                    </Text>
                </View>

                <EditableSection
                    title={t("personalInfo")}
                    editing={editingInfo}
                    saving={savingInfo}
                    error={infoError}
                    onEdit={startEditInfo}
                    onCancel={cancelEditInfo}
                    onSave={saveInfo}
                >
                    <EditableField
                        first
                        label={t("name")}
                        editing={editingInfo}
                        value={editingInfo ? draft.name : profile.name}
                        onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
                        autoCapitalize="words"
                        autoComplete="name"
                        textContentType="name"
                        returnKeyType="next"
                    />
                    <EditableField
                        label={t("email")}
                        editing={editingInfo}
                        value={editingInfo ? draft.email : profile.email}
                        onChangeText={(email) => setDraft((d) => ({ ...d, email }))}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        keyboardType="email-address"
                        textContentType="emailAddress"
                        returnKeyType="done"
                        onSubmitEditing={saveInfo}
                    />
                </EditableSection>

                <EditableSection
                    title={t("password")}
                    editing={editingPassword}
                    saving={savingPassword}
                    error={passwordError}
                    onEdit={startEditPassword}
                    onCancel={cancelEditPassword}
                    onSave={savePassword}
                >
                    {editingPassword ? (
                        <>
                            <EditableField
                                first
                                editing
                                secureTextEntry
                                label={t("currentPassword")}
                                value={passwords.current}
                                onChangeText={(current) =>
                                    setPasswords((p) => ({ ...p, current }))
                                }
                                autoComplete="current-password"
                                textContentType="password"
                            />
                            <EditableField
                                editing
                                secureTextEntry
                                label={t("newPassword")}
                                value={passwords.next}
                                onChangeText={(next) =>
                                    setPasswords((p) => ({ ...p, next }))
                                }
                                autoComplete="new-password"
                                textContentType="newPassword"
                            />
                            <EditableField
                                editing
                                secureTextEntry
                                label={t("confirmPassword")}
                                value={passwords.confirm}
                                onChangeText={(confirm) =>
                                    setPasswords((p) => ({ ...p, confirm }))
                                }
                                autoComplete="new-password"
                                textContentType="newPassword"
                                returnKeyType="done"
                                onSubmitEditing={savePassword}
                            />
                        </>
                    ) : (
                        <EditableField
                            first
                            secureTextEntry
                            editing={false}
                            label={t("password")}
                            value="••••••••"
                        />
                    )}
                </EditableSection>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: c.background,
    },
    back: {
        width: 38,
        height: 38,
        borderRadius: 19,
        marginStart: 16,
        backgroundColor: c.surface,
        alignItems: "center",
        justifyContent: "center",
    },
    hero: {
        alignItems: "center",
        paddingHorizontal: 16,
        marginTop: 8,
        marginBottom: 24,
    },
    avatar: {
        width: 104,
        height: 104,
        borderRadius: 52,
        marginBottom: 14,
        backgroundColor: c.surfacePressed,
    },
    name: {
        color: c.text,
        fontSize: 24,
        fontWeight: "700",
    },
    email: {
        color: c.textMuted,
        fontSize: 15,
        marginTop: 4,
    },
    sectionTitle: {
        color: c.textMuted,
        fontSize: 13,
        fontWeight: "600",
        textTransform: "uppercase",
        marginHorizontal: 20,
        marginBottom: 8,
        marginTop: 16,
    },
    card: {
        marginHorizontal: 16,
        borderRadius: 16,
        backgroundColor: c.surface,
        overflow: "hidden",
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 14,
    },
    rowDivider: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: c.border,
    },
    rowIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: c.fill,
        alignItems: "center",
        justifyContent: "center",
    },
    rowLabel: {
        flex: 1,
        color: c.text,
        fontSize: 17,
        fontWeight: "500",
    },
    pressed: {
        backgroundColor: c.surfacePressed,
    },
});
