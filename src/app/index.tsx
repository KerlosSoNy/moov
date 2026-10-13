
import { router, useFocusEffect } from "expo-router";
import { ImageBackground } from "react-native";

export default function Index() {

  useFocusEffect(() => {
    setTimeout(() => {
      router.replace("/home")
    }, 3000)
  })
  return (
    // <LinearGradient
    //   colors={["#060614", "#FC466B"]}
    //   start={{ x: 0, y: 0 }}
    //   end={{ x: 2, y: 1 }}
    //   style={{ flex: 1 }}
    // >
    //   <SafeAreaView style={{ flex: 1 }}>
    //     <View className="flex-1 items-center justify-center">
    //       <Image source={require("../../assets/image/logos/moov-bg.png")} className="" />
    //     </View>
    //   </SafeAreaView>
    // </LinearGradient>
    <ImageBackground source={require("../../assets/image/bg/loading.png")} className="flex-1 items-center justify-center" />
  );
}
