import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/i18n/languageProvider";
import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import {
    Modal,
    Pressable,
    ScrollView,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TrailerSheetProps = {
    visible: boolean;
    onClose: () => void;
    movie: any;
};

// Pulls the video id out of youtube.com/watch?v=… and youtu.be/… links
const youtubeId = (url?: string | null) =>
    url?.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1] ?? null;

const hasValue = (value: unknown) =>
    value !== null &&
    value !== undefined &&
    value !== "" &&
    !(Array.isArray(value) && value.length === 0);

export default function TrailerSheet({
    visible,
    onClose,
    movie,
}: TrailerSheetProps) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const { colors } = useTheme();

    const trailer: string | null = movie?.trailer || null;
    const videoId = youtubeId(trailer);

    const openUrl = (url: string) => WebBrowser.openBrowserAsync(url);

    const yesNo = (value?: boolean) =>
        typeof value === "boolean" ? (value ? t("yes") : t("no")) : null;

    const rows: { label: string; value: unknown }[] = [
        { label: t("originalTitle"), value: movie?.original_title },
        { label: t("released"), value: movie?.released },
        {
            label: t("runtime"),
            value: movie?.runtime ? `${movie.runtime} ${t("minutes")}` : null,
        },
        { label: t("certification"), value: movie?.certification },
        { label: t("country"), value: movie?.country?.toUpperCase() },
        {
            label: t("languages"),
            value: movie?.languages
                ?.map((l: string) => l.toUpperCase())
                .join(", "),
        },
        { label: t("status"), value: movie?.status },
        { label: t("votes"), value: movie?.votes?.toLocaleString() },
        { label: t("comments"), value: movie?.comment_count?.toLocaleString() },
        { label: t("afterCredits"), value: yesNo(movie?.after_credits) },
        { label: t("duringCredits"), value: yesNo(movie?.during_credits) },
    ];

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View
                className="flex-1 justify-end"
                style={{ backgroundColor: colors.backdrop }}
            >
                <Pressable className="absolute inset-0" onPress={onClose} />
                <View
                    className="rounded-t-3xl"
                    style={{
                        maxHeight: height * 0.85,
                        paddingBottom: insets.bottom + 16,
                        backgroundColor: colors.background,
                    }}
                >
                    <View className="flex-row items-center justify-between px-5 pb-3 pt-4">
                        <Text
                            className="text-xl font-bold"
                            style={{ color: colors.text }}
                        >
                            {t("trailer")}
                        </Text>
                        <Pressable
                            onPress={onClose}
                            hitSlop={10}
                            accessibilityLabel={t("close")}
                            className="h-8 w-8 items-center justify-center rounded-full"
                            style={{ backgroundColor: colors.fill }}
                        >
                            <Feather name="x" size={18} color={colors.text} />
                        </Pressable>
                    </View>

                    <ScrollView
                        contentContainerStyle={{ paddingHorizontal: 20, gap: 20 }}
                        showsVerticalScrollIndicator={false}
                    >
                        {trailer ? (
                            <Pressable
                                onPress={() => openUrl(trailer)}
                                className="overflow-hidden rounded-2xl bg-black"
                                style={{ aspectRatio: 16 / 9 }}
                            >
                                {videoId && (
                                    <Image
                                        source={{
                                            uri: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                                        }}
                                        style={{ width: "100%", height: "100%" }}
                                        contentFit="cover"
                                        transition={200}
                                    />
                                )}
                                <View className="absolute inset-0 items-center justify-center gap-2 bg-black/30">
                                    <View className="h-14 w-14 items-center justify-center rounded-full bg-white/90">
                                        <Feather name="play" size={26} color="black" />
                                    </View>
                                    <Text className="font-semibold text-white">
                                        {t("watchTrailer")}
                                    </Text>
                                </View>
                            </Pressable>
                        ) : (
                            <View
                                className="items-center justify-center gap-2 rounded-2xl"
                                style={{
                                    aspectRatio: 16 / 9,
                                    backgroundColor: colors.surface,
                                }}
                            >
                                <Feather name="video-off" size={32} color={colors.textMuted} />
                                <Text style={{ color: colors.textMuted }}>
                                    {t("noTrailer")}
                                </Text>
                            </View>
                        )}

                        <View className="gap-3">
                            <Text
                                className="text-lg font-bold"
                                style={{ color: colors.text }}
                            >
                                {t("details")}
                            </Text>
                            <View
                                className="overflow-hidden rounded-2xl"
                                style={{ backgroundColor: colors.surface }}
                            >
                                {rows.map((row, i) => (
                                    <View
                                        key={row.label}
                                        className="flex-row justify-between gap-4 px-4 py-3"
                                        style={i > 0 && {
                                            borderTopWidth: 1,
                                            borderTopColor: colors.border,
                                        }}
                                    >
                                        <Text style={{ color: colors.textMuted }}>
                                            {row.label}
                                        </Text>
                                        {hasValue(row.value) ? (
                                            <Text
                                                className="flex-1 text-right font-medium capitalize"
                                                style={{ color: colors.text }}
                                            >
                                                {String(row.value)}
                                            </Text>
                                        ) : (
                                            <Text
                                                className="flex-1 text-right italic"
                                                style={{ color: colors.textFaint }}
                                            >
                                                {t("noData")}
                                            </Text>
                                        )}
                                    </View>
                                ))}
                                <View
                                    className="flex-row justify-between gap-4 px-4 py-3"
                                    style={{
                                        borderTopWidth: 1,
                                        borderTopColor: colors.border,
                                    }}
                                >
                                    <Text style={{ color: colors.textMuted }}>
                                        {t("homepage")}
                                    </Text>
                                    {movie?.homepage ? (
                                        <Pressable
                                            className="flex-1"
                                            onPress={() => openUrl(movie.homepage)}
                                        >
                                            <Text
                                                className="text-right font-medium"
                                                style={{ color: colors.link }}
                                                numberOfLines={1}
                                            >
                                                {movie.homepage.replace(/^https?:\/\//, "")}
                                            </Text>
                                        </Pressable>
                                    ) : (
                                        <Text
                                            className="flex-1 text-right italic"
                                            style={{ color: colors.textFaint }}
                                        >
                                            {t("noData")}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        </View>

                        <View className="gap-3">
                            <Text
                                className="text-lg font-bold"
                                style={{ color: colors.text }}
                            >
                                {t("tags")}
                            </Text>
                            {movie?.subgenres?.length ? (
                                <View className="flex-row flex-wrap gap-2">
                                    {movie.subgenres.map((tag: string) => (
                                        <View
                                            key={tag}
                                            className="rounded-full px-3 py-1.5"
                                            style={{ backgroundColor: colors.surface }}
                                        >
                                            <Text
                                                className="text-xs capitalize"
                                                style={{ color: colors.text }}
                                            >
                                                {tag.replace(/-/g, " ")}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                <Text className="italic" style={{ color: colors.textFaint }}>
                                    {t("noData")}
                                </Text>
                            )}
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}
