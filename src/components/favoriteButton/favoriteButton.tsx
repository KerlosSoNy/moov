import { ON_IMAGE } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/i18n/languageProvider";
import { useFavorites } from "@/providers/favorites";
import type { Movie } from "@/types/movie";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Alert, Pressable, type StyleProp, type ViewStyle } from "react-native";

type FavoriteButtonProps = {
    movie: Movie;
    // "image" draws a dark scrim so the heart stays visible over posters
    variant?: "image" | "plain";
    size?: number;
    style?: StyleProp<ViewStyle>;
};

export default function FavoriteButton({
    movie,
    variant = "plain",
    size = 18,
    style,
}: FavoriteButtonProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const { isFavorite, toggleFavorite } = useFavorites();
    const active = isFavorite(movie.ids.trakt);
    const idle = variant === "image" ? ON_IMAGE.text : colors.textMuted;
    const box = Math.round(size * 2.1);

    const toggle = () =>
        toggleFavorite(movie).catch(() => Alert.alert(t("favoriteFailed")));

    return (
        <Pressable
            onPress={toggle}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t(active ? "removeFavorite" : "addFavorite")}
            style={({ pressed }) => [
                {
                    width: box,
                    height: box,
                    borderRadius: box / 2,
                    alignItems: "center",
                    justifyContent: "center",
                },
                variant === "image" && { backgroundColor: ON_IMAGE.scrim },
                pressed && { opacity: 0.7 },
                style,
            ]}
        >
            <FontAwesome
                name={active ? "heart" : "heart-o"}
                size={size}
                color={active ? colors.accent : idle}
            />
        </Pressable>
    );
}
