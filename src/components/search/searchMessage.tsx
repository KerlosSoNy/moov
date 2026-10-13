import { useTheme } from "@/hooks/useTheme";
import Feather from "@expo/vector-icons/Feather";
import { Pressable, Text, View } from "react-native";

type SearchMessageProps = {
    icon: keyof typeof Feather.glyphMap;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
};

// Centered placeholder for idle / empty / error states
export default function SearchMessage({
    icon,
    message,
    actionLabel,
    onAction,
}: SearchMessageProps) {
    const { colors } = useTheme();
    return (
        <View className="flex-1 items-center justify-center gap-3 px-8">
            <Feather name={icon} size={40} color={colors.textMuted} />
            <Text
                className="text-center text-base"
                style={{ color: colors.textMuted }}
            >
                {message}
            </Text>
            {actionLabel && onAction && (
                <Pressable
                    className="mt-1 rounded-full px-5 py-2"
                    style={{ backgroundColor: colors.fillPressed }}
                    onPress={onAction}
                >
                    <Text className="font-medium" style={{ color: colors.text }}>
                        {actionLabel}
                    </Text>
                </Pressable>
            )}
        </View>
    );
}
