import type { ColorScheme } from "@/constants/theme";
import { createContext, use, useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { Appearance, useColorScheme } from "react-native";

export type Theme = "system" | "light" | "dark";

type Preferences = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

const PreferencesContext = createContext<Preferences | null>(null);
// Separate from the picker state so a tap re-renders only the picker right away
const SchemeContext = createContext<ColorScheme | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>("system");
    // Re-theming every mounted screen is heavy: let it render in the background
    // so the tap and the menu animation stay responsive
    const appliedTheme = useDeferredValue(theme);
    const system = useColorScheme();
    const scheme: ColorScheme =
        appliedTheme === "system" ? (system === "light" ? "light" : "dark") : appliedTheme;

    // Native views (alerts, pickers, glass) follow once the JS tree has switched
    useEffect(() => {
        Appearance.setColorScheme(appliedTheme === "system" ? "unspecified" : appliedTheme);
    }, [appliedTheme]);

    return (
        <PreferencesContext value={{ theme, setTheme }}>
            <SchemeContext value={scheme}>{children}</SchemeContext>
        </PreferencesContext>
    );
}

export function usePreferences() {
    const ctx = use(PreferencesContext);
    if (!ctx) {
        throw new Error(
            "usePreferences must be used inside PreferencesProvider",
        );
    }
    return ctx;
}

export function useColorSchemePreference() {
    const scheme = use(SchemeContext);
    if (!scheme) {
        throw new Error(
            "useColorSchemePreference must be used inside PreferencesProvider",
        );
    }
    return scheme;
}
