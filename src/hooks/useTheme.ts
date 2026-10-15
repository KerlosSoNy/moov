import { COLORS, type ColorScheme } from "@/constants/theme";
import { useColorSchemePreference } from "@/providers/preferences";

// The user's theme pick, or the system scheme when they chose "system"
export function useTheme() {
    const scheme: ColorScheme = useColorSchemePreference();
    return { scheme, dark: scheme === "dark", colors: COLORS[scheme] };
}
