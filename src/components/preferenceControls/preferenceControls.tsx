import type { Colors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { LANGUAGES } from "@/i18n/config";
import { useTranslation } from "@/i18n/languageProvider";
import { usePreferences, type Theme } from "@/providers/preferences";
import Feather from "@expo/vector-icons/Feather";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Option<T> = {
    value: T;
    label: string;
    icon?: keyof typeof Feather.glyphMap;
};

function Segmented<T extends string>({
    options,
    value,
    onChange,
    colors,
}: {
    options: Option<T>[];
    value: T;
    onChange: (value: T) => void;
    colors: Colors;
}) {
    const fg = colors.text;
    return (
        <View style={[styles.track, { backgroundColor: colors.fill }]}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <Pressable
                        key={option.value}
                        onPress={() => onChange(option.value)}
                        style={[
                            styles.segment,
                            selected && { backgroundColor: colors.selected },
                        ]}
                    >
                        {option.icon && (
                            <Feather name={option.icon} size={14} color={fg} />
                        )}
                        <Text
                            style={[
                                styles.segmentText,
                                { color: fg, opacity: selected ? 1 : 0.6 },
                            ]}
                            numberOfLines={1}
                        >
                            {option.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

export default function PreferenceControls() {
    const { theme, setTheme } = usePreferences();
    const { language, setLanguage, t } = useTranslation();
    const { colors } = useTheme();

    const themes: Option<Theme>[] = [
        { value: "system", label: t("system"), icon: "smartphone" },
        { value: "light", label: t("light"), icon: "sun" },
        { value: "dark", label: t("dark"), icon: "moon" },
    ];

    return (
        <View style={styles.container}>
            <Text style={[styles.label, { color: colors.textMuted }]}>
                {t("language")}
            </Text>
            <Segmented
                options={LANGUAGES}
                value={language}
                onChange={setLanguage}
                colors={colors}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>
                {t("theme")}
            </Text>
            <Segmented
                options={themes}
                value={theme}
                onChange={setTheme}
                colors={colors}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: 8,
    },
    label: {
        fontSize: 13,
        fontWeight: "600",
        textTransform: "uppercase",
        marginTop: 8,
        paddingHorizontal: 4,
    },
    track: {
        flexDirection: "row",
        borderRadius: 14,
        padding: 3,
    },
    segment: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        paddingVertical: 8,
        borderRadius: 11,
    },
    segmentText: {
        fontSize: 13,
        fontWeight: "600",
    },
});
