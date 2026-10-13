import Tabs from "@/components/tabs/tabs";
import { useTheme } from "@/hooks/useTheme";
import { LanguageProvider, useTranslation } from "@/i18n/languageProvider";
import { PreferencesProvider } from "@/providers/preferences";
import { LocaleProvider, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import '../styles/global.css';

export default function RootLayout() {
  return (
    <LanguageProvider>
      <PreferencesProvider>
        <AppShell />
      </PreferencesProvider>
    </LanguageProvider>
  )
}

function AppShell() {
  const pathName = usePathname();
  const { direction } = useTranslation();
  const { dark, colors } = useTheme();
  return (
    <LocaleProvider direction={direction}>
      <GestureHandlerRootView style={{ flex: 1, direction, backgroundColor: colors.background }}>
        <StatusBar style={dark ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerShown: false,
            gestureEnabled: false,
            contentStyle: { backgroundColor: colors.background },
            // fullScreenGestureEnabled: true,
          }}>
          <Stack.Screen name="index" />
        </Stack>
        {pathName !== "/" && <Tabs />}
      </GestureHandlerRootView>
    </LocaleProvider>
  )
}
