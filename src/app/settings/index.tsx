import PreferenceControls from "@/components/preferenceControls/preferenceControls";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/i18n/languageProvider";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SettingsScreen() {
    const { t } = useTranslation();
    const { colors } = useTheme();

    return (
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
            <View className="px-5 pt-4">
                <Text
                    className="mb-4 text-3xl font-bold"
                    style={{ color: colors.text }}
                >
                    {t("settings")}
                </Text>
                <PreferenceControls />
            </View>
        </SafeAreaView>
    );
}
