import { EditableField, EditableSection } from "@/components/profile/editableSection";
import type { Colors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/i18n/languageProvider";
import { useUser } from "@/providers/auth";
import {
    avatarUrl,
    changePassword,
    isValidEmail,
    saveProfile,
    toProfile,
    uploadAvatar,
    WrongPasswordError,
    type Profile,
} from "@/services/profile/profile";
import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { launchImageLibraryAsync } from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
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


const MIN_PASSWORD_LENGTH = 8;
const EMPTY_PASSWORDS = { current: "", next: "", confirm: "" };

export default function ProfileScreen() {
    const insets = useSafeAreaInsets();
    const { t, isRTL } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);

    const user = useUser();
    // Supabase keeps the user in sync after updates, so derive the profile from it
    const profile = toProfile(user);
    const [draft, setDraft] = useState<Profile>(profile);
    const [editingInfo, setEditingInfo] = useState(false);
    const [savingInfo, setSavingInfo] = useState(false);
    const [infoError, setInfoError] = useState<string | null>(null);

    const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
    const [editingPassword, setEditingPassword] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    const changeAvatar = async () => {
        const result = await launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });
        if (result.canceled) return;

        setUploadingAvatar(true);
        try {
            await uploadAvatar(user, result.assets[0]);
        } catch (e) {
            console.error(e);
            // @ts-expect-error type missing
            Alert.alert(t("avatarFailed"));
        } finally {
            setUploadingAvatar(false);
        }
    };

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
            const { emailPending } = await saveProfile(user, next);
            setEditingInfo(false);
            setInfoError(null);
            // @ts-expect-error type missing
            if (emailPending) Alert.alert(t("emailChangePending"));
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
            await changePassword(profile.email, passwords.current, passwords.next);
            cancelEditPassword();
            Alert.alert(t("passwordChanged"));
        } catch (e) {
            // @ts-expect-error type missing
            setPasswordError(t(e instanceof WrongPasswordError ? "wrongPassword" : "saveFailed"));
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
                    <Pressable
                        onPress={changeAvatar}
                        disabled={uploadingAvatar}
                        accessibilityRole="button"
                        //@ts-expect-error type missing
                        accessibilityLabel={t("changePhoto")}
                        style={styles.avatarWrap}
                    >
                        <Image
                            source={{ uri: avatarUrl(user) }}
                            style={styles.avatar}
                            contentFit="cover"
                            transition={200}
                        />
                        {uploadingAvatar && (
                            <View style={styles.avatarOverlay}>
                                <ActivityIndicator color="#fff" />
                            </View>
                        )}
                        <View style={styles.avatarBadge}>
                            <Feather name="camera" size={15} color="#fff" />
                        </View>
                    </Pressable>
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
    avatarWrap: {
        marginBottom: 14,
    },
    avatar: {
        width: 104,
        height: 104,
        borderRadius: 52,
        backgroundColor: c.surfacePressed,
    },
    avatarOverlay: {
        ...StyleSheet.absoluteFill,
        borderRadius: 52,
        backgroundColor: "rgba(0,0,0,0.45)",
        alignItems: "center",
        justifyContent: "center",
    },
    avatarBadge: {
        position: "absolute",
        bottom: 0,
        end: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: c.accent,
        borderWidth: 3,
        borderColor: c.background,
        alignItems: "center",
        justifyContent: "center",
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
