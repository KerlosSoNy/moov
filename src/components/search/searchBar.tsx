import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/i18n/languageProvider";
import Feather from "@expo/vector-icons/Feather";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Pressable, StyleSheet, TextInput } from "react-native";

const hasGlass = isLiquidGlassAvailable();

type SearchBarProps = {
    value: string;
    onChangeText: (text: string) => void;
    onClear: () => void;
    placeholder?: string;
    autoFocus?: boolean;
};

export default function SearchBar({
    value,
    onChangeText,
    onClear,
    placeholder,
    autoFocus,
}: SearchBarProps) {
    const { isRTL } = useTranslation();
    const { scheme, colors } = useTheme();
    const muted = colors.textMuted;

    return (
        <GlassView
            style={[styles.bar, !hasGlass && { backgroundColor: colors.fill }]}
            colorScheme={scheme}
            isInteractive
        >
            <Feather name="search" size={18} color={muted} />
            <TextInput
                style={[
                    styles.input,
                    { color: colors.text, textAlign: isRTL ? "right" : "left" },
                ]}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={muted}
                selectionColor={colors.text}
                keyboardAppearance={scheme}
                autoFocus={autoFocus}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
            />
            {value.length > 0 && (
                <Pressable onPress={onClear} hitSlop={10}>
                    <Feather name="x-circle" size={18} color={muted} />
                </Pressable>
            )}
        </GlassView>
    );
}

const styles = StyleSheet.create({
    bar: {
        height: 48,
        borderRadius: 24,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        overflow: "hidden",
    },
    input: {
        flex: 1,
        fontSize: 16,
    },
});
