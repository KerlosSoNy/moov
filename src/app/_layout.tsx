import Tabs from "@/components/tabs/tabs";
import { Stack, usePathname } from "expo-router";
import '../styles/global.css';

export default function RootLayout() {
  const pathName = usePathname();
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
          // fullScreenGestureEnabled: true,
        }}>
        <Stack.Screen name="index" />
      </Stack>
      {pathName !== "/" && <Tabs />}
    </>
  )
}
