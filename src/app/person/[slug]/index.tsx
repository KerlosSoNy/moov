import MovieRow from '@/components/home/movieRow';
import Filmography from '@/components/person/filmography';
import { ON_IMAGE, type Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { imgUrl } from '@/lib/image';
import { fetchPerson, fetchPersonMovies, type PersonMovies } from '@/services/person/person';
import type { Person } from '@/types/movie';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BIO_LINES = 4;
const BACKDROP_HEIGHT = 220;
const HEADSHOT = 128;

export default function PersonDetails() {
    const { slug } = useLocalSearchParams<{ slug: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [person, setPerson] = useState<Person | null>(null);
    const [error, setError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [movies, setMovies] = useState<PersonMovies | null>(null);
    const [moviesLoading, setMoviesLoading] = useState(true);
    const [bioExpanded, setBioExpanded] = useState(false);
    const { t, language } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);

    useEffect(() => {
        const controller = new AbortController();
        fetchPerson(slug, controller.signal)
            .then(setPerson)
            .catch(() => !controller.signal.aborted && setError(true));
        fetchPersonMovies(slug, controller.signal)
            .then(setMovies)
            .catch(() => setMovies(null))
            .finally(() => !controller.signal.aborted && setMoviesLoading(false));
        return () => controller.abort();
    }, [slug, reloadKey]);

    const retry = () => {
        setError(false);
        setMoviesLoading(true);
        setReloadKey((key) => key + 1);
    };

    const backButton = (
        <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={{ ...styles.backButton, top: insets.top + 8 }}
        >
            <Feather name="chevron-left" size={22} color={ON_IMAGE.text} />
        </Pressable>
    );

    if (error) {
        return (
            <View style={styles.centered}>
                <Stack.Screen options={{ headerShown: false }} />
                <Feather name="alert-circle" size={32} color={colors.textMuted} />
                <Text style={{ color: colors.text }}>{t('personError')}</Text>
                <Pressable
                    onPress={retry}
                    style={({ pressed }) => ({ ...styles.retryButton, backgroundColor: pressed ? colors.surfacePressed : colors.surface })}
                >
                    <Text style={{ color: colors.text, fontWeight: '600' }}>{t('retry')}</Text>
                </Pressable>
                {backButton}
            </View>
        );
    }

    if (!person) {
        return (
            <View style={styles.centered}>
                <Stack.Screen options={{ headerShown: false }} />
                <ActivityIndicator color={colors.text} />
                {backButton}
            </View>
        );
    }

    const headshot = imgUrl(person.images?.headshot?.[0]);
    const backdrop = imgUrl(person.images?.fanart?.[0]);
    const formatDate = (date: string) =>
        new Date(date).toLocaleDateString(language, { year: 'numeric', month: 'long', day: 'numeric' });
    const biography = person.biography?.trim();
    const facts = [
        person.birthday && { icon: 'gift' as const, label: t('born'), value: formatDate(person.birthday) },
        person.death && { icon: 'calendar' as const, label: t('died'), value: formatDate(person.death) },
        person.birthplace && { icon: 'map-pin' as const, label: null, value: person.birthplace },
    ].filter((fact) => !!fact);

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
                {/* Backdrop fading into the page, with the headshot overlapping its bottom edge */}
                <View style={{ height: BACKDROP_HEIGHT + insets.top, backgroundColor: colors.surface }}>
                    {backdrop && (
                        <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
                    )}
                    <View
                        style={{
                            ...StyleSheet.absoluteFill,
                            experimental_backgroundImage: `linear-gradient(to top, ${colors.background} 0%, rgba(${colors.backgroundRgb}, 0.3) 50%, rgba(${colors.backgroundRgb}, 0) 100%)`,
                        }}
                    />
                </View>
                <View style={styles.header}>
                    <View style={styles.headshot}>
                        {headshot ? (
                            <Image source={{ uri: headshot }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
                        ) : (
                            <Feather name="user" size={52} color={colors.textMuted} />
                        )}
                    </View>
                    <Text style={styles.name}>{person.name}</Text>
                    {!!person.known_for_department && (
                        <View style={styles.departmentPill}>
                            <Text style={styles.departmentText}>{person.known_for_department}</Text>
                        </View>
                    )}
                </View>

                {facts.length > 0 && (
                    <View style={styles.card}>
                        {facts.map((fact, index) => (
                            <View key={index} style={{ ...styles.factRow, ...(index > 0 ? styles.factDivider : null) }}>
                                <View style={styles.factIcon}>
                                    <Feather name={fact.icon} size={15} color={colors.accent} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    {!!fact.label && <Text style={styles.factLabel}>{fact.label}</Text>}
                                    <Text style={styles.factValue} numberOfLines={2}>{fact.value}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {!!biography && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>{t('biography')}</Text>
                        <Text numberOfLines={bioExpanded ? undefined : BIO_LINES} style={styles.biography}>
                            {biography}
                        </Text>
                        {biography.length > 220 && (
                            <Pressable onPress={() => setBioExpanded((expanded) => !expanded)} hitSlop={8}>
                                <Text style={styles.link}>{bioExpanded ? t('showLess') : t('showMore')}</Text>
                            </Pressable>
                        )}
                    </View>
                )}

                <View style={{ marginTop: 28 }}>
                    <MovieRow title={t('knownFor')} movies={movies?.knownFor ?? []} loading={moviesLoading} />
                    {movies && (
                        <Filmography filmography={movies.filmography} initialDepartment={person.known_for_department} />
                    )}
                </View>
            </ScrollView>

            {/* Keeps the status bar readable once content scrolls underneath it */}
            <View
                pointerEvents="none"
                style={{
                    ...styles.statusBarFade,
                    height: insets.top + 12,
                    experimental_backgroundImage: `linear-gradient(to bottom, ${colors.background} 65%, rgba(${colors.backgroundRgb}, 0))`,
                }}
            />
            {backButton}
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    centered: { flex: 1, backgroundColor: c.background, justifyContent: 'center', alignItems: 'center', gap: 12 },
    retryButton: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
    backButton: {
        position: 'absolute',
        left: 16,
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: ON_IMAGE.scrim,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusBarFade: { position: 'absolute', top: 0, left: 0, right: 0 },
    header: { alignItems: 'center', paddingHorizontal: 16, marginTop: -HEADSHOT * 0.6 },
    headshot: {
        width: HEADSHOT,
        height: HEADSHOT,
        borderRadius: HEADSHOT / 2,
        overflow: 'hidden',
        backgroundColor: c.surface,
        borderWidth: 4,
        borderColor: c.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    name: { color: c.text, fontSize: 26, fontWeight: '800', marginTop: 12, textAlign: 'center' },
    departmentPill: { marginTop: 8, backgroundColor: c.fill, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
    departmentText: { color: c.textSecondary, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
    card: { marginHorizontal: 16, marginTop: 24, backgroundColor: c.surface, borderRadius: 16, paddingHorizontal: 14 },
    factRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    factDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    factIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' },
    factLabel: { color: c.textMuted, fontSize: 12, marginBottom: 1 },
    factValue: { color: c.text, fontSize: 15, fontWeight: '500' },
    section: { paddingHorizontal: 16, marginTop: 28 },
    sectionTitle: { color: c.text, fontSize: 22, fontWeight: '700', marginBottom: 10 },
    biography: { color: c.textSecondary, fontSize: 15, lineHeight: 23 },
    link: { color: c.link, marginTop: 8, fontWeight: '600' },
});
