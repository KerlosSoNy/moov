import Tabs from "@/components/tabs/tabs";
import { useTheme } from "@/hooks/useTheme";
import { LanguageProvider, useTranslation } from "@/i18n/languageProvider";
import { AuthProvider, useAuth } from "@/providers/auth";
import { FavoritesProvider } from "@/providers/favorites";
import { PreferencesProvider } from "@/providers/preferences";
import { LocaleProvider, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import '../styles/global.css';

// Screens where the floating tab bar is hidden
const NO_TABS = ["/", "/login", "/signup", "/forgot-password", "/reset-password"];

export default function RootLayout() {
  return (
    <LanguageProvider>
      <PreferencesProvider>
        <AuthProvider>
          <FavoritesProvider>
            <AppShell />
          </FavoritesProvider>
        </AuthProvider>
      </PreferencesProvider>
    </LanguageProvider>
  )
}

function AppShell() {
  const pathName = usePathname();
  const { direction } = useTranslation();
  const { dark, colors } = useTheme();
  const { user, recovering } = useAuth();
  const signedIn = !!user;
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
          {/* Splash is the anchor: when a guard flips (log in / log out) the router
              falls back here and it redirects to the right place */}
          <Stack.Screen name="index" />
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="login/index" />
            <Stack.Screen name="signup/index" />
            <Stack.Screen name="forgot-password/index" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && recovering}>
            <Stack.Screen name="reset-password/index" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && !recovering}>
            <Stack.Screen name="home/index" />
            <Stack.Screen name="favorite/index" />
            <Stack.Screen name="search/index" />
            <Stack.Screen name="settings/index" />
            <Stack.Screen name="profile/index" />
            <Stack.Screen name="movie/[slug]/index" />
            <Stack.Screen name="person/[slug]/index" />
          </Stack.Protected>
        </Stack>
        {signedIn && !recovering && !NO_TABS.includes(pathName) && <Tabs />}
      </GestureHandlerRootView>
    </LocaleProvider>
  )
}
