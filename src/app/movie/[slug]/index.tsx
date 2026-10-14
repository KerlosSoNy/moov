import CommentsSection from '@/components/comments/commentsSection';
import CommunityRating from '@/components/community/communityRating';
import OverviewSection from '@/components/content/overviewSection';
import ScheduleButton from '@/components/schedule/scheduleButton';
import FavoriteButton from '@/components/favoriteButton/favoriteButton';
import MovieRow from '@/components/home/movieRow';
import CastRow from '@/components/movie/castRow';
import TrailerSheet from '@/components/movie/trailerSheet';
import { ON_IMAGE } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { imgUrl } from '@/lib/image';
import { normalizeTraktTitle } from '@/services/content/normalize';
import { fetchMovie, fetchMoviePeople, fetchRelatedMovies } from '@/services/movie/movieDetails';
import type { CastMember, Movie, MovieDetails as MovieDetailsData } from '@/types/movie';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const fallback = require('../../../../assets/image/loading.png');

export default function MovieDetails() {
    const { slug, focus } = useLocalSearchParams<{ slug: string; focus?: string }>();
    const scroll = useRef<ScrollView>(null);
    const scrolledToComments = useRef(false);
    const router = useRouter();
    const [movie, setMovie] = useState<MovieDetailsData | null>(null);
    const [error, setError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [cast, setCast] = useState<CastMember[]>([]);
    const [directors, setDirectors] = useState<string[]>([]);
    const [peopleLoading, setPeopleLoading] = useState(true);
    const [related, setRelated] = useState<Movie[]>([]);
    const [relatedLoading, setRelatedLoading] = useState(true);
    const [trailerOpen, setTrailerOpen] = useState(false);
    const { t } :any= useTranslation();
    const { colors } = useTheme();

    useEffect(() => {
        const controller = new AbortController();
        fetchMovie(slug, controller.signal)
            .then(setMovie)
            .catch(() => !controller.signal.aborted && setError(true));
        return () => controller.abort();
    }, [slug, reloadKey]);

    // Cast and related movies are secondary: they load on their own and simply hide on failure
    useEffect(() => {
        const controller = new AbortController();
        fetchMoviePeople(slug, controller.signal)
            .then((people) => {
                setCast((people.cast ?? []).slice(0, 20));
                setDirectors(
                    (people.crew?.directing ?? [])
                        .filter((member) => member.job === 'Director')
                        .map((member) => member.person.name),
                );
            })
            .catch(() => setCast([]))
            .finally(() => !controller.signal.aborted && setPeopleLoading(false));
        fetchRelatedMovies(slug, controller.signal)
            .then(setRelated)
            .catch(() => setRelated([]))
            .finally(() => !controller.signal.aborted && setRelatedLoading(false));
        return () => controller.abort();
    }, [slug, reloadKey]);

    const retry = () => {
        setError(false);
        setPeopleLoading(true);
        setRelatedLoading(true);
        setReloadKey((key) => key + 1);
    };

    if (error) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                <Text style={{ color: colors.text }}>{t('movieError')}</Text>
                <Pressable
                    onPress={retry}
                    style={({ pressed }) => ({ backgroundColor: pressed ? colors.surfacePressed : colors.surface, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 })}
                >
                    <Text style={{ color: colors.text, fontWeight: '600' }}>{t('retry')}</Text>
                </Pressable>
                <Pressable onPress={() => router.back()}>
                    <Text style={{ color: colors.link }}>{t('back')}</Text>
                </Pressable>
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

    // Comments and ratings key Trakt movies by their numeric id, which stays stable if the slug changes
    const communityRef = { provider: 'trakt', type: 'movie', id: String(movie.ids.trakt) } as const;
    // The movie as a ContentItem: English overview comes with it, Arabic is
    // loaded from Trakt translations; also what the schedule stores
    const overviewItem = normalizeTraktTitle(movie, 'movie');
    const poster = imgUrl(movie.images?.poster?.[0]);
    const backdrop = imgUrl(movie.images?.fanart?.[0]);
    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
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
                                ★ {movie.rating.toFixed(1)} <Text style={{ color: colors.textMuted, fontWeight: '400' }}>({t('traktRating')} · {movie.votes ?? 0} {t('votes').toLowerCase()})</Text>
                            </Text>
                        ) : (
                            <Text style={{ color: colors.textMuted, fontStyle: 'italic', marginTop: 4 }}>★ {t('noData')}</Text>
                        )}
                        {directors.length > 0 && (
                            <Text numberOfLines={1} style={{ color: colors.textMuted, marginTop: 4 }}>
                                {t('director')}: <Text style={{ color: colors.text, fontWeight: '600' }}>{directors.join(', ')}</Text>
                            </Text>
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
                    {overviewItem && (
                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                            <ScheduleButton item={overviewItem} />
                        </View>
                    )}
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
                    {overviewItem && <OverviewSection item={overviewItem} />}
                </View>

                <View style={{ marginTop: 24 }}>
                    <CommunityRating content={communityRef} />
                </View>

                <View style={{ marginTop: 28 }}>
                    <CastRow title={t('cast')} cast={cast} loading={peopleLoading} />
                    <MovieRow title={t('relatedMovies')} movies={related} loading={relatedLoading} />
                </View>

                <View
                    style={{ marginTop: 8 }}
                    onLayout={(e) => {
                        // Notification deep links ask to open straight at the comments
                        if (focus === 'comments' && !scrolledToComments.current) {
                            scrolledToComments.current = true;
                            const y = e.nativeEvent.layout.y;
                            requestAnimationFrame(() => scroll.current?.scrollTo({ y, animated: true }));
                        }
                    }}
                >
                    <CommentsSection content={communityRef} />
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
        </KeyboardAvoidingView>
    );
}