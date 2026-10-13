import MovieResultItem from "@/components/search/movieResultItem";
import SearchMessage from "@/components/search/searchMessage";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/i18n/languageProvider";
import { useFavorites } from "@/providers/favorites";
import type { Movie } from "@/types/movie";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const TAB_BAR_SPACE = 120;

export default function FavoriteScreen() {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const router = useRouter();
    const { favorites, status, reload } = useFavorites();

    const openMovie = (movie: Movie) =>
        router.push({ pathname: "/movie/[slug]", params: { slug: movie.ids.slug } });

    const renderBody = () => {
        if (status === "loading" && favorites.length === 0) {
            return (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator color={colors.text} />
                </View>
            );
        }
        if (status === "error") {
            return (
                <SearchMessage
                    icon="alert-circle"
                    message={t("favoritesError")}
                    actionLabel={t("retry")}
                    onAction={reload}
                />
            );
        }
        if (favorites.length === 0) {
            return <SearchMessage icon="heart" message={t("favoritesEmpty")} />;
        }
        return (
            <FlatList
                data={favorites}
                keyExtractor={(movie) => String(movie.ids.trakt)}
                renderItem={({ item }) => (
                    <MovieResultItem movie={item} onPress={openMovie} />
                )}
                refreshControl={
                    <RefreshControl
                        refreshing={status === "loading"}
                        onRefresh={reload}
                        tintColor={colors.text}
                    />
                }
                contentContainerStyle={{
                    paddingHorizontal: 20,
                    paddingBottom: TAB_BAR_SPACE,
                }}
            />
        );
    };

    return (
        <SafeAreaView
            style={{ flex: 1, backgroundColor: colors.background }}
            edges={["top"]}
        >
            <View className="px-5 pb-3 pt-4">
                <Text className="text-3xl font-bold" style={{ color: colors.text }}>
                    {t("favorites")}
                </Text>
            </View>
            {renderBody()}
        </SafeAreaView>
    );
}
