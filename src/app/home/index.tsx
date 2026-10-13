import { GlassContainer, GlassView } from 'expo-glass-effect';
import { Image, StyleSheet, View } from 'react-native';

export default function GlassContainerDemo() {
    return (
        <View style={styles.container}>
            <Image
                style={styles.backgroundImage}
                source={{
                    uri: 'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=400&h=600&fit=crop',
                }}
            />
            <GlassContainer spacing={10} style={styles.containerStyle}>
                <GlassView style={styles.glass1} isInteractive />
                <GlassView style={styles.glass2} />
                <GlassView style={styles.glass3} />
            </GlassContainer>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    backgroundImage: {
        ...StyleSheet.absoluteFill,
        width: '100%',
        height: '100%',
    },
    containerStyle: {
        position: 'absolute',
        top: 200,
        left: 50,
        width: 250,
        height: 100,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    glass1: {
        width: 60,
        height: 60,
        borderRadius: 30,
    },
    glass2: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    glass3: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
});
