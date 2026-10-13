import { COLORS, type ColorScheme } from "@/constants/theme";
import { useColorScheme } from "react-native";

// Follows Appearance, which PreferencesProvider overrides when the user picks a theme
export function useTheme() {
    const scheme: ColorScheme = useColorScheme() === "light" ? "light" : "dark";
    return { scheme, dark: scheme === "dark", colors: COLORS[scheme] };
}
