import Feather from "@expo/vector-icons/Feather";
import Fontisto from "@expo/vector-icons/Fontisto";
import { GlassView } from "expo-glass-effect";
import { StyleSheet, View } from "react-native";
import SingleTab from "../singleTab/singleTab";

export default function Tabs() {
    return (
        <View style={styles.bar}>
            {/* Three tabs in one glass pill */}
            <GlassView style={styles.main} isInteractive>
                <SingleTab
                    icon={<Feather name="home" size={24} color="white" />}
                    link="/home"
                />
                <SingleTab
                    icon={<Fontisto name="favorite" size={22} color="white" />}
                    link="/profile"
                />
                <SingleTab
                    icon={<Feather name="search" size={24} color="white" />}
                    link="/search"
                />
            </GlassView>

            {/* Separate menu button */}
            <GlassView style={styles.menu} isInteractive>
                <SingleTab
                    icon={<Feather name="menu" size={24} color="white" />}
                    link="/profile"
                />
            </GlassView>
        </View>
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
});