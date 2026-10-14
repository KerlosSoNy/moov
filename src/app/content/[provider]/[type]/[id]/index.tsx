import CommentsSection from '@/components/comments/commentsSection';
import CommunityRating from '@/components/community/communityRating';
import OverviewSection from '@/components/content/overviewSection';
import ScheduleButton from '@/components/schedule/scheduleButton';
import WhereToWatch from '@/components/content/whereToWatch';
import { ON_IMAGE, type Colors } from '@/constants/theme';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { findShoofTitle, loadShoofPlatforms, type Platform } from '@/services/content/shoofAflam';
import { fetchTraktTitle } from '@/services/content/trakt';
import { displayTitle, secondaryTitle, type ContentItem, type ContentType } from '@/types/content';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, Platform as RNPlatform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const fallback = require('../../../../../../assets/image/loading.png');

type Params = { provider: string; type: string; id: string; focus?: string };

const isType = (value: string): value is ContentType => value === 'movie' || value === 'series';

async function loadTitle(provider: string, type: string, id: string, signal: AbortSignal): Promise<ContentItem | null> {
    if (!isType(type)) return null;
    if (provider === 'shoofaflam') return findShoofTitle(type, id);
    if (provider === 'trakt') return fetchTraktTitle(type, id, signal);
    return null;
}

export default function ContentDetails() {
    const { provider, type, id, focus } = useLocalSearchParams<Params>();
    const router = useRouter();
    const { t, language, isRTL }:any = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);
    const title = useAsync((signal) => loadTitle(provider, type, id, signal), `${provider}:${type}:${id}`);
    const platforms = useAsync(
        () => (provider === 'shoofaflam' ? loadShoofPlatforms() : Promise.resolve(new Map<string, Platform>())),
        `platforms:${provider}`,
    );
    const scroll = useRef<ScrollView>(null);
    const scrolledToComments = useRef(false);

    const backButton = (
        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, [isRTL ? 'right' : 'left']: 16 }}>
            <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('back')} style={styles.back}>
                <Text style={{ color: ON_IMAGE.text, fontSize: 20 }}>{isRTL ? '›' : '‹'}</Text>
            </Pressable>
        </SafeAreaView>
    );

    if (title.status === 'loading' && !title.data) {
        return (
            <View style={[styles.container, { justifyContent: 'center' }]}>
                <ActivityIndicator color={colors.text} />
                {backButton}
            </View>
        );
    }

    if (!title.data) {
        // Error, unknown id, or a title no longer in the catalog
        return (
            <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center', gap: 12 }]}>
                <Text style={{ color: colors.text }}>{t(title.status === 'error' ? 'contentError' : 'contentNotFound')}</Text>
                {title.status === 'error' && (
                    <Pressable onPress={title.retry} style={styles.retry}>
                        <Text style={{ color: colors.text, fontWeight: '600' }}>{t('retry')}</Text>
                    </Pressable>
                )}
                <Pressable onPress={() => router.back()}>
                    <Text style={{ color: colors.link }}>{t('back')}</Text>
                </Pressable>
            </SafeAreaView>
        );
    }

    const item = title.data;
    const subtitle = secondaryTitle(item, language);
    const heroImage = item.backdrop ?? item.poster;
    const ratingSource = item.provider === 'shoofaflam' ? t('shoofRating') : t('traktRating');
    const where = item.platforms
        .map((p) => platforms.data?.get(p) ?? { id: p, nameAr: p, nameEn: p, color: null, logoText: null, url: null })
        .filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i);

    return (
        <KeyboardAvoidingView style={styles.container} behavior={RNPlatform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
                <View style={{ height: 320 }}>
                    {heroImage && <Image source={{ uri: heroImage }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={item.backdrop ? 0 : 24} />}
                    <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: `linear-gradient(to top, ${colors.background} 10%, rgba(${colors.backgroundRgb}, 0) 70%)` }]} />
                </View>
                <View style={styles.headerRow}>
                    <View style={styles.poster}>
                        <Image source={item.poster ? { uri: item.poster } : fallback} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    </View>
                    <View style={{ flex: 1, marginStart: 14, justifyContent: 'flex-end', gap: 4 }}>
                        <Text style={styles.title}>{displayTitle(item, language) || t('noData')}</Text>
                        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                        <Text style={styles.meta}>
                            {[
                                item.year,
                                t(item.type === 'series' ? 'seriesBadge' : 'movieBadge'),
                                item.country?.toUpperCase(),
                                item.originalLanguage?.toUpperCase(),
                            ]
                                .filter(Boolean)
                                .join(' • ')}
                        </Text>
                        <Text style={styles.providerRating}>
                            {item.rating !== null ? `★ ${item.rating.toFixed(1)}/10 ` : `★ ${t('noData')} `}
                            <Text style={styles.ratingSource}>({ratingSource})</Text>
                        </Text>
                    </View>
                </View>

                <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 16 }}>
                    <ScheduleButton item={item} />
                    {!!item.genres.length && (
                        <View style={styles.chips}>
                            {item.genres.map((genre) => (
                                <View key={genre} style={styles.chip}>
                                    <Text style={styles.chipText}>{genre.replace(/-/g, ' ')}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                    <OverviewSection item={item} />
                    {item.provider === 'shoofaflam' && <WhereToWatch platforms={where} />}
                </View>

                <View style={{ marginTop: 24 }}>
                    <CommunityRating content={item} />
                </View>
                <View
                    style={{ marginTop: 28 }}
                    onLayout={(e) => {
                        // Notification deep links ask to open straight at the comments
                        if (focus === 'comments' && !scrolledToComments.current) {
                            scrolledToComments.current = true;
                            const y = e.nativeEvent.layout.y;
                            requestAnimationFrame(() => scroll.current?.scrollTo({ y, animated: true }));
                        }
                    }}
                >
                    <CommentsSection content={item} />
                </View>
            </ScrollView>
            {backButton}
        </KeyboardAvoidingView>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    back: { width: 38, height: 38, borderRadius: 19, backgroundColor: ON_IMAGE.scrim, justifyContent: 'center', alignItems: 'center' },
    retry: { backgroundColor: c.surface, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
    headerRow: { flexDirection: 'row', paddingHorizontal: 16, marginTop: -90 },
    poster: { width: 110, height: 165, borderRadius: 12, overflow: 'hidden', backgroundColor: c.surface },
    title: { color: c.text, fontSize: 22, fontWeight: '700' },
    subtitle: { color: c.textSecondary, fontSize: 15 },
    meta: { color: c.textMuted },
    providerRating: { color: c.rating, fontWeight: '700' },
    ratingSource: { color: c.textMuted, fontWeight: '400', fontSize: 12 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { backgroundColor: c.fill, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
    chipText: { color: c.text, fontSize: 13, textTransform: 'capitalize' },
});
