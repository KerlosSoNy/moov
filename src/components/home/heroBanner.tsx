import TrailerSheet from '@/components/movie/trailerSheet';
import { ON_IMAGE, type Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { imgUrl } from '@/lib/image';
import type { Movie } from '@/types/movie';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HERO_HEIGHT = 480;

export default function HeroBanner({ movie }: { movie?: Movie }) {
    const router = useRouter();
    const { t } = useTranslation();
    const [trailerOpen, setTrailerOpen] = useState(false);
    const insets = useSafeAreaInsets();
    const { colors } = useTheme();
    const styles = createStyles(colors);

    if (!movie) return <View style={[styles.hero, styles.placeholder]} />;

    const backdrop = imgUrl(movie.images?.fanart?.[0] ?? movie.images?.poster?.[0]);
    const openDetails = () => router.push({ pathname: '/movie/[slug]', params: { slug: movie.ids.slug } });

    return (
        <View style={styles.hero}>
            {backdrop && <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />}
            <View style={styles.gradient} />

            <View style={[styles.topBar, { top: insets.top + 8 }]}>
                {movie.trailer ? (
                    <Pressable
                        onPress={() => setTrailerOpen(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('watchTrailer')}
                        hitSlop={8}
                        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                    >
                        <Feather name="play" size={20} color={ON_IMAGE.text} />
                    </Pressable>
                ) : (
                    <View />
                )}
                <Pressable
                    onPress={openDetails}
                    accessibilityRole="button"
                    accessibilityLabel={t('details')}
                    hitSlop={8}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                    <Feather name="info" size={20} color={ON_IMAGE.text} />
                </Pressable>
            </View>

            <View style={styles.content}>
                <Text style={styles.title} numberOfLines={2}>{movie.title}</Text>
                <Text style={styles.meta}>
                    {[
                        movie.year,
                        typeof movie.rating === 'number' && `★ ${movie.rating.toFixed(1)}`,
                        movie.genres?.slice(0, 2).map((g) => g.replace(/-/g, ' ')).join(', '),
                    ]
                        .filter(Boolean)
                        .join('  •  ')}
                </Text>
            </View>

            <TrailerSheet visible={trailerOpen} onClose={() => setTrailerOpen(false)} movie={movie} />
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    hero: { height: HERO_HEIGHT, marginBottom: 24, justifyContent: 'flex-end' },
    placeholder: { backgroundColor: c.surface },
    gradient: {
        ...StyleSheet.absoluteFill,
        experimental_backgroundImage: `linear-gradient(to top, ${c.background} 5%, rgba(${c.backgroundRgb}, 0.6) 40%, rgba(${c.backgroundRgb}, 0) 70%)`,
    },
    content: { paddingHorizontal: 16 },
    title: { color: c.text, fontSize: 32, fontWeight: '800' },
    meta: { color: c.textSecondary, marginTop: 6, textTransform: 'capitalize' },
    topBar: {
        position: 'absolute',
        left: 16,
        right: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        zIndex: 1,
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: ON_IMAGE.scrim,
    },
    pressed: { opacity: 0.8 },
});
