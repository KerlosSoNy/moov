import { router } from 'expo-router';
import { Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
    return (
        <SafeAreaView className="flex-1 items-center justify-center bg-red-500">
            <Text>Edit src/app/profile/index.tsx to edit this screen.</Text>
            <TouchableOpacity onPress={() => { router.back() }}>
                <Text>Go back</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
}


