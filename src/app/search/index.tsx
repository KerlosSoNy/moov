import ContentResultItem from "@/components/search/contentResultItem";
import SearchBar from "@/components/search/searchBar";
import SearchMessage from "@/components/search/searchMessage";
import { useSearch } from "@/hooks/useSearch";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/i18n/languageProvider";
import { contentHref } from "@/lib/contentRoutes";
import { searchAll, type SearchSection } from "@/services/search/searchAll";
import type { ContentItem } from "@/types/content";
import Feather from "@expo/vector-icons/Feather";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import {
    ActivityIndicator,
    Keyboard,
    Pressable,
    SectionList,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const TAB_BAR_SPACE = 120;

export default function SearchScreen() {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const router = useRouter();
    const { genre } = useLocalSearchParams<{ genre?: string }>();
    const search = useCallback(
        (q: string, signal: AbortSignal) => searchAll(q, signal, genre),
        [genre],
    );
    const { query, setQuery, clear, retry, results, status } = useSearch<SearchSection>(
        search,
        { minLength: genre ? 0 : 1, scope: genre },
    );

    const clearGenre = () => router.setParams({ genre: undefined });

    const openItem = (item: ContentItem) => {
        Keyboard.dismiss();
        router.push(contentHref(item));
    };

    // Sections with results, plus a note for a source that failed
    const sections = results
        .filter((section) => section.items.length || section.failed)
        .map((section) => ({ ...section, data: section.items }));
    const total = results.reduce((n, section) => n + section.items.length, 0);

    const renderBody = () => {
        switch (status) {
            case "idle":
                return <SearchMessage icon="film" message={t("searchHint")} />;
            case "loading":
                return (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator color={colors.text} />
                    </View>
                );
            case "error":
                return (
                    <SearchMessage
                        icon="alert-circle"
                        message={t("searchError")}
                        actionLabel={t("retry")}
                        onAction={retry}
                    />
                );
            case "success":
                if (total === 0 && !sections.some((s) => s.failed)) {
                    return <SearchMessage icon="search" message={t("searchNoResults")} />;
                }
                return (
                    <SectionList
                        sections={sections}
                        keyExtractor={(item) => item.key}
                        renderItem={({ item }) => <ContentResultItem item={item} onPress={openItem} />}
                        renderSectionHeader={({ section }) => (
                            <View className="pb-1 pt-4" style={{ backgroundColor: colors.background }}>
                                <Text className="text-lg font-bold" style={{ color: colors.text }}>
                                    {t(section.id === "arabic" ? "searchArabicSection" : "searchInternationalSection")}
                                    {section.items.length ? (
                                        <Text style={{ color: colors.textMuted, fontWeight: "600" }}>  {section.items.length}</Text>
                                    ) : null}
                                </Text>
                                {section.failed && (
                                    <Pressable onPress={retry} hitSlop={6}>
                                        <Text className="text-sm" style={{ color: colors.danger }}>
                                            {t("searchSourceFailed")}
                                        </Text>
                                    </Pressable>
                                )}
                            </View>
                        )}
                        stickySectionHeadersEnabled={false}
                        keyboardShouldPersistTaps="handled"
                        onScrollBeginDrag={Keyboard.dismiss}
                        contentContainerStyle={{
                            paddingHorizontal: 20,
                            paddingBottom: TAB_BAR_SPACE,
                        }}
                    />
                );
        }
    };

    return (
        <SafeAreaView
            style={{ flex: 1, backgroundColor: colors.background }}
            edges={["top"]}
        >
            <View className="gap-4 px-5 pb-3 pt-4">
                <Text
                    className="text-3xl font-bold"
                    style={{ color: colors.text }}
                >
                    {t("search")}
                </Text>
                <SearchBar
                    value={query}
                    onChangeText={setQuery}
                    onClear={clear}
                    placeholder={t("searchPlaceholder")}
                />
                {!!genre && (
                    <Pressable
                        onPress={clearGenre}
                        className="flex-row items-center gap-2 self-start rounded-full px-3 py-1.5"
                        style={({ pressed }) => ({
                            backgroundColor: pressed
                                ? colors.fillPressed
                                : colors.fill,
                        })}
                    >
                        <Text
                            className="text-sm capitalize"
                            style={{ color: colors.text }}
                        >
                            {genre.replace(/-/g, " ")}
                        </Text>
                        <Feather name="x" size={14} color={colors.text} />
                    </Pressable>
                )}
            </View>
            {renderBody()}
        </SafeAreaView>
    );
}
