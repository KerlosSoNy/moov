import { useTheme } from "@/hooks/useTheme";
import Feather from "@expo/vector-icons/Feather";
import Fontisto from "@expo/vector-icons/Fontisto";
import {
    GlassView,
    isLiquidGlassAvailable,
    type GlassViewProps,
} from "expo-glass-effect";
import { usePathname } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
    useAnimatedProps,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import Menu from "../menu/menu";
import SingleTab from "../singleTab/singleTab";

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);
const hasGlass = isLiquidGlassAvailable();

type TabsProps = {
    visible?: boolean;
};

export default function Tabs({ visible = true }: TabsProps) {
    const fadeOpacity = useSharedValue(visible ? 1 : 0);
    const pathname = usePathname();
    const { scheme, colors } = useTheme();
    const fallback = !hasGlass && { backgroundColor: colors.glassFallback };
    const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
    const menuOpen = visible && menuOpenOn === pathname;
    const closeMenu = useCallback(() => setMenuOpenOn(null), []);

    useEffect(() => {
        fadeOpacity.set(withTiming(visible ? 1 : 0, { duration: 500 }));
    }, [visible, fadeOpacity]);

    const glassProps = useAnimatedProps<GlassViewProps>(() => ({
        glassEffectStyle: fadeOpacity.get() > 0.01 ? "regular" : "none",
    }));

    const fadeStyle = useAnimatedStyle(() => ({
        opacity: fadeOpacity.get(),
    }));

    return (
        <>
            <Animated.View
                style={[styles.bar, fadeStyle]}
                pointerEvents={visible ? "auto" : "none"}
            >
                <AnimatedGlassView
                    style={[styles.main, fallback]}
                    animatedProps={glassProps}
                    isInteractive
                    colorScheme={scheme}
                >
                    <SingleTab
                        icon={<Feather name="home" size={24} color={colors.text} />}
                        link="/home"
                    />
                    <SingleTab
                        icon={
                            <Fontisto name="favorite" size={22} color={colors.text} />
                        }
                        link="/favorite"
                    />
                    <SingleTab
                        icon={<Feather name="search" size={24} color={colors.text} />}
                        link="/search"
                    />
                </AnimatedGlassView>

                <AnimatedGlassView
                    style={[styles.menu, fallback]}
                    animatedProps={glassProps}
                    isInteractive
                    colorScheme={scheme}
                >
                    <Pressable
                        style={styles.menuButton}
                        onPress={() => setMenuOpenOn(menuOpen ? null : pathname)}
                    >
                        <Feather
                            name={menuOpen ? "x" : "menu"}
                            size={24}
                            color={colors.text}
                        />
                    </Pressable>
                </AnimatedGlassView>
            </Animated.View>
            <Menu open={menuOpen} onClose={closeMenu} />
        </>
    );
}

const styles = StyleSheet.create({
    bar: {
        position: "absolute",
        bottom: 28,
        left: "5%",
        width: "90%",
        height: 48,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    main: {
        flex: 1,
        height: 64,
        borderRadius: 32,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-around",
    },
    menu: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: "center",
        justifyContent: "center",
    },
    menuButton: {
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
    },
});
