import MovieResultItem from "@/components/search/movieResultItem";
import SearchBar from "@/components/search/searchBar";
import SearchMessage from "@/components/search/searchMessage";
import { useSearch } from "@/hooks/useSearch";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/i18n/languageProvider";
import type { Movie } from "@/types/movie";
import { searchMovies } from "@/services/search/searchMovies";
import Feather from "@expo/vector-icons/Feather";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    Pressable,
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
        (q: string, signal: AbortSignal) => searchMovies(q, signal, genre),
        [genre],
    );
    const { query, setQuery, clear, retry, results, status } = useSearch(
        search,
        { minLength: genre ? 0 : 1, scope: genre },
    );

    const clearGenre = () => router.setParams({ genre: undefined });

    const openMovie = (movie: Movie) => {
        Keyboard.dismiss();
        router.push({
            pathname: "/movie/[slug]",
            params: { slug: movie.ids.slug },
        });
    };

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
                if (results.length === 0) {
                    return (
                        <SearchMessage
                            icon="search"
                            message={t("searchNoResults")}
                        />
                    );
                }
                return (
                    <FlatList
                        data={results}
                        keyExtractor={(item) => String(item.movie.ids.trakt)}
                        renderItem={({ item }) => (
                            <MovieResultItem
                                movie={item.movie}
                                onPress={openMovie}
                            />
                        )}
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
