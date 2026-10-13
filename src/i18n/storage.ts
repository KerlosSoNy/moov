import Storage from "expo-sqlite/kv-store";
import { DEFAULT_LANGUAGE, isLanguage, type Language } from "./config";

const KEY = "language";

export function loadLanguage(): Language {
    try {
        const saved = Storage.getItemSync(KEY);
        return isLanguage(saved) ? saved : DEFAULT_LANGUAGE;
    } catch {
        return DEFAULT_LANGUAGE;
    }
}

export function saveLanguage(language: Language) {
    Storage.setItem(KEY, language).catch((error) =>
        console.warn("Failed to save language", error),
    );
}
