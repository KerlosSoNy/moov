import { View } from "react-native";
import SingleTab from "../singleTab/singleTab";

export default function Tabs() {
    return (
        <View className="absolute bottom-8 w-[95%] left-[2.5%] h-14 bg-black/20 backdrop-blur-sm rounded-full flex-row flex items-center justify-around">
            <SingleTab text="Home" link="/home" />
            <SingleTab text="Profile" link="/profile" />
        </View>
    )
}
