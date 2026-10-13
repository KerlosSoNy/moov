import { useTheme } from "@/hooks/useTheme";
import type { Movie } from "@/types/movie";
import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

type MovieResultItemProps = {
    movie: Movie;
    onPress?: (movie: Movie) => void;
};

function MovieResultItem({ movie, onPress }: MovieResultItemProps) {
    const poster = movie?.images?.poster?.[0];
    const { colors } = useTheme();
    return (
        <Pressable
            className="flex-row items-center gap-4 rounded-2xl px-2 py-2"
            style={({ pressed }) =>
                pressed && { backgroundColor: colors.fillPressed }
            }
            onPress={() => onPress?.(movie)}
        >
            <Image
                source={
                    poster
                        ? {
                            uri: poster.startsWith("http")
                                ? poster
                                : `https://${poster}`,
                        }
                        : require("../../../assets/image/loading.png")
                }
                style={{
                    width: 56,
                    height: 84,
                    borderRadius: 8,
                    backgroundColor: colors.surface,
                }}
                contentFit="cover"
                transition={200}
            />
            <View className="flex-1 gap-1">
                <Text
                    className="text-base font-semibold"
                    style={{ color: colors.text }}
                    numberOfLines={1}
                >
                    {movie.title}
                </Text>
                <Text
                    className="text-sm"
                    style={{ color: colors.textMuted }}
                    numberOfLines={1}
                >
                    {movie.year} · {movie.genres.join(", ")}
                </Text>
                <View className="flex-row items-center gap-1">
                    <Feather name="star" size={12} color={colors.rating} />
                    <Text className="text-xs" style={{ color: colors.textMuted }}>
                        {movie.rating.toFixed(1)}
                    </Text>
                </View>
            </View>
        </Pressable>
    );
}

export default memo(MovieResultItem);
