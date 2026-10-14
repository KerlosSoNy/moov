import type { Colors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { LANGUAGES } from "@/i18n/config";
import { useTranslation } from "@/i18n/languageProvider";
import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { Link, type Href } from "expo-router";
import type { ReactNode } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const logo = require("../../../assets/image/logos/3.png");

type AuthScreenProps = {
    title: string;
    subtitle: string;
    children: ReactNode;
};

export function AuthScreen({ title, subtitle, children }: AuthScreenProps) {
    const insets = useSafeAreaInsets();
    const { colors } = useTheme();
    const styles = createStyles(colors);

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                    styles.content,
                    { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
                ]}
            >
                <Image source={logo} style={styles.logo} contentFit="contain" />
                <Text className='-mt-4' style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
                {children}
            </ScrollView>
            <LanguageToggle style={{ top: 0 }} />
        </KeyboardAvoidingView>
    );
}

// Signed-out users can't reach settings, so the auth screens offer the switch themselves.
// Shows the language it switches to, cycling through the available ones
function LanguageToggle({ style }: { style: { top: number } }) {
    const { language, setLanguage } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);
    const index = LANGUAGES.findIndex((l) => l.value === language);
    const next = LANGUAGES[(index + 1) % LANGUAGES.length];

    return (
        <Pressable
            onPress={() => setLanguage(next.value)}
            hitSlop={8}
            accessibilityRole="button"
            className="absolute right-[43%] gap-2 items-center bottom-[45px]"
            style={({ pressed }) => [styles.language, style, pressed && { opacity: 0.7 }]}
        >
            <Feather name="globe" size={15} color={colors.text} />
            <Text style={styles.languageText}>{next.label}</Text>
        </Pressable>
    );
}

type AuthInputProps = Omit<TextInputProps, "style"> & { label: string };

export function AuthInput({ label, ...input }: AuthInputProps) {
    const { colors } = useTheme();
    const styles = createStyles(colors);

    return (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
                {...input}
                placeholderTextColor={colors.textFaint}
                style={styles.input}
            />
        </View>
    );
}

type AuthButtonProps = {
    label: string;
    loading?: boolean;
    onPress: () => void;
};

export function AuthButton({ label, loading = false, onPress }: AuthButtonProps) {
    const { colors } = useTheme();
    const styles = createStyles(colors);

    return (
        <Pressable
            onPress={onPress}
            disabled={loading}
            accessibilityRole="button"
            className='bg-[#060614] items-center py-4 rounded-2xl'
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
        >
            {loading ? (
                <ActivityIndicator color="#fff" />
            ) : (
                <Text style={styles.buttonText}>{label}</Text>
            )}
        </Pressable>
    );
}

export function AuthMessage({ text, tone }: { text: string | null; tone: "error" | "info" }) {
    const { colors } = useTheme();
    const styles = createStyles(colors);
    if (!text) return null;
    return (
        <Text style={[styles.message, { color: tone === "error" ? colors.danger : colors.textSecondary }]}>
            {text}
        </Text>
    );
}

type AuthSwitchProps = { prompt: string; action: string; href: Href };

export function AuthSwitch({ prompt, action, href }: AuthSwitchProps) {
    const { colors } = useTheme();
    const styles = createStyles(colors);

    return (
        <View style={styles.switch}>
            <Text style={styles.switchPrompt}>{prompt}</Text>
            <Link href={href} replace asChild>
                <Pressable hitSlop={8}>
                    <Text style={styles.switchAction}>{action}</Text>
                </Pressable>
            </Link>
        </View>
    );
}

// A small trailing link under a field, e.g. "Forgot password?"
export function AuthLink({ label, href }: { label: string; href: Href }) {
    const { colors } = useTheme();
    const styles = createStyles(colors);

    return (
        <Link href={href} asChild>
            <Pressable hitSlop={8} style={styles.link}>
                <Text style={styles.switchAction}>{label}</Text>
            </Pressable>
        </Link>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { flexGrow: 1, paddingHorizontal: 24 },
    logo: { width: 72, height: 72, borderRadius: 18, alignSelf: "center", marginBottom: 24 },
    title: { color: c.text, fontSize: 30, fontWeight: "800", textAlign: "center" },
    subtitle: { color: c.textMuted, fontSize: 15, textAlign: "center", marginTop: 6, marginBottom: 32 },
    field: { marginBottom: 14 },
    label: { color: c.textMuted, fontSize: 13, fontWeight: "600", marginBottom: 6, marginStart: 4 },
    input: {
        color: c.text,
        fontSize: 17,
        backgroundColor: c.surface,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.border,
        paddingHorizontal: 16,
        paddingVertical: 14,
        textAlign: "auto",
    },
    button: {
        height: 52,
        borderRadius: 26,
        backgroundColor: c.accent,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 10,
    },
    buttonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
    message: { fontSize: 14, textAlign: "center", marginTop: 4, marginBottom: 6 },
    switch: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 24 },
    switchPrompt: { color: c.textMuted, fontSize: 15 },
    switchAction: { color: c.link, fontSize: 15, fontWeight: "600" },
    language: {
        position: "absolute",
        end: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 16,
        backgroundColor: c.fill,
    },
    languageText: { color: c.text, fontSize: 14, fontWeight: "600" },
    link: { alignSelf: "flex-end", marginTop: -4, marginBottom: 8, marginEnd: 4 },
});
