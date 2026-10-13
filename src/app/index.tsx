
import { useAuth } from "@/providers/auth";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ImageBackground } from "react-native";

const SPLASH_MS = 3000;
// The splash animation only plays on launch; later visits (after log in / log out) redirect at once
let splashShown = false;

export default function Index() {
  const { user, loading, recovering } = useAuth();
  const [ready, setReady] = useState(splashShown);

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => {
      splashShown = true;
      setReady(true);
    }, SPLASH_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (!ready || loading) return;
    if (!user) router.replace("/login");
    else router.replace(recovering ? "/reset-password" : "/home");
  }, [ready, loading, user, recovering]);

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
