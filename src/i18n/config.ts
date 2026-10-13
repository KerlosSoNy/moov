import ar from "./locales/ar";
import en, { type Translations } from "./locales/en";

export type { TranslationKey, Translations } from "./locales/en";

export type Direction = "ltr" | "rtl";

type LocaleConfig = {
    label: string;
    direction: Direction;
    translations: Translations;
};

export const LOCALES = {
    en: { label: "English", direction: "ltr", translations: en },
    ar: { label: "العربية", direction: "rtl", translations: ar },
} satisfies Record<string, LocaleConfig>;

export type Language = keyof typeof LOCALES;

export const DEFAULT_LANGUAGE: Language = "en";

export const LANGUAGES = (Object.keys(LOCALES) as Language[]).map((value) => ({
    value,
    label: LOCALES[value].label,
}));

export const isLanguage = (value: unknown): value is Language =>
    typeof value === "string" && value in LOCALES;
