import FavoriteButton from '@/components/favoriteButton/favoriteButton';
import TrailerSheet from '@/components/movie/trailerSheet';
import { ON_IMAGE } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { apiRequest } from '@/lib/fetchInstance';
import { imgUrl } from '@/lib/image';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const fallback = require('../../../../assets/image/loading.png');

export default function MovieDetails() {
    const { slug } = useLocalSearchParams<{ slug: string }>();
    const router = useRouter();
    const [movie, setMovie] = useState<any>(null);
    const [error, setError] = useState(false);
    const [trailerOpen, setTrailerOpen] = useState(false);
    const { t } = useTranslation();
    const { colors } = useTheme();
    console.log(movie)
    useEffect(() => {
        apiRequest(`/movies/${slug}?extended=full,images`)
            .then(setMovie)
            .catch(() => setError(true));
    }, [slug]);
    if (error) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: colors.text }}>Failed to load movie.</Text>
            </SafeAreaView>
        );
    }

    if (!movie) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
                <ActivityIndicator color={colors.text} />
            </View>
        );
    }

    const poster = imgUrl(movie.images?.poster?.[0]);
    const backdrop = imgUrl(movie.images?.fanart?.[0]);
    console.log(colors)
    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
                <View style={{ height: 400, backgroundColor: colors.background }}>
                    {backdrop && <Image source={{ uri: backdrop }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                    <View style={{ experimental_backgroundImage: `linear-gradient(to top, ${colors.background} 30%, rgba(${colors.backgroundRgb}, 0))`, position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, }} />
                </View>
                <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginTop: -70 }}>
                    <View style={{ width: 110, height: 165, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface }}>
                        <Image
                            source={poster ? { uri: poster } : fallback}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                        />
                    </View>
                    <View style={{ flex: 1, marginLeft: 14, justifyContent: 'flex-end' }}>
                        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{movie.title || t('noData')}</Text>
                        <Text style={{ color: colors.textMuted, marginTop: 4 }}>
                            {[movie.year, movie.runtime && `${movie.runtime} ${t('minutes')}`, movie.certification].filter(Boolean).join(' • ') || t('noData')}
                        </Text>
                        {typeof movie.rating === 'number' ? (
                            <Text style={{ color: colors.rating, fontWeight: '700', marginTop: 4 }}>
                                ★ {movie.rating.toFixed(1)} <Text style={{ color: colors.textMuted, fontWeight: '400' }}>({movie.votes ?? 0} {t('votes').toLowerCase()})</Text>
                            </Text>
                        ) : (
                            <Text style={{ color: colors.textMuted, fontStyle: 'italic', marginTop: 4 }}>★ {t('noData')}</Text>
                        )}
                    </View>
                </View>

                <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
                    <Pressable
                        onPress={() => setTrailerOpen(true)}
                        className="mx-auto items-center my-2"
                        style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            height: 48,
                            borderRadius: 24,
                            marginBottom: 20,
                            backgroundColor: pressed ? colors.surfacePressed : colors.surface,
                        })}
                    >
                        <View style={{ borderRadius: 999, padding: 8, backgroundColor: colors.accent, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                            <Feather name={movie.trailer ? 'play' : 'info'} size={16} color="#fff" />
                        </View>
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
                            {movie.trailer ? t('watchTrailer') : t('details')}
                        </Text>
                    </Pressable>
                    {!!movie.genres?.length && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                            {movie.genres.map((g: string) => (
                                <Pressable
                                    key={g}
                                    onPress={() => router.push({ pathname: '/search', params: { genre: g } })}
                                    className="bg-[#060614] px-3 py-2 items-center rounded-full justify-center"
                                    style={({ pressed }) => ({ backgroundColor: pressed ? colors.surfacePressed : colors.rating, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 })}
                                >
                                    <Text style={{ color: '#fff', fontSize: 12, textTransform: 'capitalize' }}>{g.replace(/-/g, ' ')}</Text>
                                </Pressable>
                            ))}
                        </View>
                    )}
                    {!!movie.tagline && (
                        <Text style={{ color: colors.textMuted, fontStyle: 'italic', marginBottom: 10 }}>{movie.tagline}</Text>
                    )}
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Overview</Text>
                    {movie.overview ? (
                        <Text style={{ color: colors.textSecondary, lineHeight: 22 }}>{movie.overview}</Text>
                    ) : (
                        <Text style={{ color: colors.textMuted, fontStyle: 'italic' }}>{t('noData')}</Text>
                    )}
                </View>
            </ScrollView>

            <TrailerSheet visible={trailerOpen} onClose={() => setTrailerOpen(false)} movie={movie} />

            <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 16 }}>
                <Pressable
                    onPress={() => router.back()}
                    style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: ON_IMAGE.scrim, justifyContent: 'center', alignItems: 'center' }}
                >
                    <Text style={{ color: ON_IMAGE.text, fontSize: 20 }}>‹</Text>
                </Pressable>
            </SafeAreaView>
            <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, right: 16 }}>
                <FavoriteButton movie={movie} variant="image" />
            </SafeAreaView>
        </View>
    );
}