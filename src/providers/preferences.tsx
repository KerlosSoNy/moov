import { createContext, use, useState, type ReactNode } from "react";
import { Appearance } from "react-native";

export type Theme = "system" | "light" | "dark";

type Preferences = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>("system");

    const setTheme = (next: Theme) => {
        Appearance.setColorScheme(next === "system" ? "unspecified" : next);
        setThemeState(next);
    };

    return (
        <PreferencesContext value={{ theme, setTheme }}>
            {children}
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
