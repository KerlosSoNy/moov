import { useTheme } from '@/hooks/useTheme';
import { router } from 'expo-router';
import { Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
    const { colors } = useTheme();
    return (
        <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
            <Text style={{ color: colors.text }}>Edit src/app/favorite/index.tsx to edit this screen.</Text>
            <TouchableOpacity onPress={() => { router.back() }}>
                <Text style={{ color: colors.link }}>Go back</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
}


