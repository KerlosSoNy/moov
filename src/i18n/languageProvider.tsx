import { reloadAppAsync } from "expo";
import { createContext, use, useState, type ReactNode } from "react";
import {
    LOCALES,
    type Direction,
    type Language,
    type TranslationKey,
} from "./config";
import { loadLanguage, saveLanguage } from "./storage";

type LanguageContextValue = {
    language: Language;
    setLanguage: (language: Language) => void;
    direction: Direction;
    isRTL: boolean;
    t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>(loadLanguage);

    // Restart the app instead of re-rendering the whole tree in place: switching
    // direction (LTR <-> RTL) live is janky, a fresh launch picks it up cleanly
    const setLanguage = (next: Language) => {
        if (next === language) return;
        saveLanguage(next);
        reloadAppAsync("Language changed").catch(() => setLanguageState(next));
    };

    const { direction, translations } = LOCALES[language];

    return (
        <LanguageContext
            value={{
                language,
                setLanguage,
                direction,
                isRTL: direction === "rtl",
                t: (key) => translations[key],
            }}
        >
            {children}
        </LanguageContext>
    );
}

export function useTranslation() {
    const ctx = use(LanguageContext);
    if (!ctx) {
        throw new Error("useTranslation must be used inside LanguageProvider");
    }
    return ctx;
}
