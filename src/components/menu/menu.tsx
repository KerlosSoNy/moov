import PreferenceControls from "@/components/preferenceControls/preferenceControls";
import { CURRENT_USER } from "@/constants/user";
import { useTheme } from "@/hooks/useTheme";
import type { TranslationKey } from "@/i18n/config";
import { useTranslation } from "@/i18n/languageProvider";
import Feather from "@expo/vector-icons/Feather";
import {
    GlassView,
    isLiquidGlassAvailable,
    type GlassViewProps,
} from "expo-glass-effect";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useEffect } from "react";
import {
    BackHandler,
    Pressable,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    Easing,
    useAnimatedProps,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);
const hasGlass = isLiquidGlassAvailable();
const TIMING = { duration: 320, easing: Easing.out(Easing.cubic) };

type MenuItem = {
    label: TranslationKey;
    icon: keyof typeof Feather.glyphMap;
    onPress: () => void;
    destructive?: boolean;
};

const go = (href: Href) => () => router.push(href);

const ITEMS: MenuItem[] = [
    { label: "profile", icon: "user", onPress: go("/profile") },
    { label: "settings", icon: "settings", onPress: go("/settings") },
];

const logout = () => router.replace("/");

type MenuProps = {
    open: boolean;
    onClose: () => void;
};

export default function Menu({ open, onClose }: MenuProps) {
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const { t, isRTL } = useTranslation();
    const { scheme, colors } = useTheme();
    const fg = colors.text;
    const muted = colors.textMuted;
    const drawerWidth = Math.min(width * 0.8, 340);
    const side = isRTL ? -1 : 1;
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.set(withTiming(open ? 1 : 0, TIMING));
    }, [open, progress]);

    useEffect(() => {
        if (!open) return;
        const sub = BackHandler.addEventListener("hardwareBackPress", () => {
            onClose();
            return true;
        });
        return () => sub.remove();
    }, [open, onClose]);

    const pan = Gesture.Pan()
        .enabled(open)
        .activeOffsetX(10)
        .failOffsetY([-15, 15])
        .onUpdate((e) => {
            const dx = Math.max(0, e.translationX * side);
            progress.set(1 - Math.min(dx / drawerWidth, 1));
        })
        .onEnd((e) => {
            const shouldClose = e.velocityX * side > 500 || progress.get() < 0.5;
            progress.set(withTiming(shouldClose ? 0 : 1, TIMING));
            if (shouldClose) scheduleOnRN(onClose);
        });

    const glassProps = useAnimatedProps<GlassViewProps>(() => ({
        glassEffectStyle: progress.get() > 0.01 ? "regular" : "none",
    }));

    const drawerStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: (1 - progress.get()) * (drawerWidth + 24) * side },
        ],
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: progress.get(),
    }));

    return (
        <View
            style={StyleSheet.absoluteFill}
            pointerEvents={open ? "auto" : "none"}
        >
            <Animated.View
                style={[
                    styles.backdrop,
                    { backgroundColor: colors.backdrop },
                    backdropStyle,
                ]}
            >
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            </Animated.View>

            <GestureDetector gesture={pan}>
                <Animated.View
                    style={[styles.drawer, { width: drawerWidth }, drawerStyle]}
                >
                    <AnimatedGlassView
                        style={[
                            styles.glass,
                            !hasGlass && { backgroundColor: colors.glassFallback },
                            {
                                paddingTop: insets.top + 12,
                                paddingBottom: insets.bottom + 12,
                            },
                        ]}
                        animatedProps={glassProps}
                        colorScheme={scheme}
                    >
                        <View style={styles.header}>
                            <Pressable
                                style={styles.user}
                                onPress={() => {
                                    onClose();
                                    router.push("/profile");
                                }}
                            >
                                <Image
                                    source={{ uri: CURRENT_USER.avatar }}
                                    style={[
                                        styles.avatar,
                                        { backgroundColor: colors.fill },
                                    ]}
                                    contentFit="cover"
                                    transition={200}
                                />
                                <View style={styles.userText}>
                                    <Text
                                        style={[styles.name, { color: fg }]}
                                        numberOfLines={1}
                                    >
                                        {CURRENT_USER.name}
                                    </Text>
                                    <Text
                                        style={[styles.email, { color: muted }]}
                                        numberOfLines={1}
                                    >
                                        {CURRENT_USER.email}
                                    </Text>
                                </View>
                            </Pressable>
                            <Pressable
                                style={[
                                    styles.logout,
                                    { backgroundColor: colors.fill },
                                ]}
                                onPress={() => {
                                    onClose();
                                    logout();
                                }}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel={t("logout")}
                            >
                                <Feather
                                    name="log-out"
                                    size={20}
                                    color={colors.danger}
                                />
                            </Pressable>
                        </View>

                        <View
                            style={[
                                styles.divider,
                                { backgroundColor: colors.border },
                            ]}
                        />

                        {ITEMS.map((item) => {
                            const color = item.destructive ? colors.danger : fg;
                            return (
                                <Pressable
                                    key={t(item.label)}
                                    style={({ pressed }) => [
                                        styles.item,
                                        pressed && {
                                            backgroundColor: colors.fillPressed,
                                        },
                                    ]}
                                    className="flex flex-row py-3 w-full items-center justify-between"
                                    onPress={() => {
                                        onClose();
                                        item.onPress();
                                    }}
                                >
                                    <Text style={[styles.label, { color }]}>
                                        {t(`${item.label}`)}
                                    </Text>
                                    <Feather
                                        name={item.icon}
                                        size={22}
                                        color={color}
                                    />
                                </Pressable>
                            );
                        })}

                        <View style={styles.footer}>
                            <PreferenceControls />
                        </View>
                    </AnimatedGlassView>
                </Animated.View>
            </GestureDetector>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFill,
    },
    drawer: {
        position: "absolute",
        top: 0,
        end: 0,
        bottom: 0,
    },
    glass: {
        flex: 1,
        paddingHorizontal: 16,
        borderTopStartRadius: 32,
        borderBottomStartRadius: 32,
        overflow: "hidden",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 4,
        marginBottom: 16,
    },
    user: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
    },
    userText: {
        flex: 1,
        gap: 2,
    },
    name: {
        fontSize: 18,
        fontWeight: "700",
    },
    email: {
        fontSize: 13,
    },
    logout: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 4,
        marginBottom: 8,
    },
    footer: {
        marginTop: "auto",
        paddingHorizontal: 4,
    },
    item: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 12,
        borderRadius: 16,
    },
    label: {
        fontSize: 17,
        fontWeight: "600",
    },
});
