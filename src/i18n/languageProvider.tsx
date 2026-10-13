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

    const setLanguage = (next: Language) => {
        setLanguageState(next);
        saveLanguage(next);
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
