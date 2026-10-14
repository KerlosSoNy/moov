import FavoriteButton from "@/components/favoriteButton/favoriteButton";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/i18n/languageProvider";
import { toFavoriteMovie } from "@/lib/contentRoutes";
import { displayTitle, secondaryTitle, type ContentItem } from "@/types/content";
import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

type ContentResultItemProps = {
    item: ContentItem;
    onPress: (item: ContentItem) => void;
};

function ContentResultItem({ item, onPress }: ContentResultItemProps) {
    const { colors } = useTheme();
    const { t, language } = useTranslation();
    const favorite = toFavoriteMovie(item);
    const subtitle = secondaryTitle(item, language);
    const meta = [
        item.year,
        t(item.type === "series" ? "seriesBadge" : "movieBadge"),
        item.genres.slice(0, 2).map((g) => g.replace(/-/g, " ")).join(", "),
    ].filter(Boolean);

    return (
        <Pressable onPress={() => onPress(item)} accessibilityRole="button">
            {({ pressed }) => (
                <View
                    className="flex-row items-center gap-4 rounded-2xl px-2 py-2"
                    style={pressed ? { backgroundColor: colors.fillPressed } : undefined}
                >
                    <Image
                        source={item.poster ? { uri: item.poster } : require("../../../assets/image/loading.png")}
                        style={{ width: 56, height: 84, borderRadius: 8, backgroundColor: colors.surface }}
                        contentFit="cover"
                        transition={200}
                        recyclingKey={item.key}
                    />
                    <View className="flex-1 gap-1">
                        <Text className="text-base font-semibold" style={{ color: colors.text }} numberOfLines={1}>
                            {displayTitle(item, language)}
                        </Text>
                        {subtitle && (
                            <Text className="text-sm" style={{ color: colors.textSecondary }} numberOfLines={1}>
                                {subtitle}
                            </Text>
                        )}
                        <Text className="text-sm capitalize" style={{ color: colors.textMuted }} numberOfLines={1}>
                            {meta.join(" · ")}
                        </Text>
                        {item.rating !== null && (
                            <View className="flex-row items-center gap-1">
                                <Feather name="star" size={12} color={colors.rating} />
                                <Text className="text-xs" style={{ color: colors.textMuted }}>
                                    {item.rating.toFixed(1)}
                                </Text>
                            </View>
                        )}
                    </View>
                    {favorite && <FavoriteButton movie={favorite} />}
                </View>
            )}
        </Pressable>
    );
}

export default memo(ContentResultItem);
