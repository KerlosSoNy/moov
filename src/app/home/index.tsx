import ContentRow from '@/components/content/contentRow';
import HeroBanner from '@/components/home/heroBanner';
import MovieRow from '@/components/home/movieRow';
import NotificationPrompt from '@/components/notifications/notificationPrompt';
import type { Colors } from '@/constants/theme';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { CATEGORIES, fetchHomeRow, type CategoryId } from '@/services/content/catalog';
import { fetchHomeMovieList, type HomeMovieList } from '@/services/home/homeMovies';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

const CATEGORY_ROWS: CategoryId[] = ['arabic-movies', 'international-movies', 'arabic-series', 'international-series', 'new-arabic'];

export default function HomeScreen() {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);
    // Bumping the generation re-runs every section (pull to refresh)
    const [generation, setGeneration] = useState(0);
    const trending = useMovieList('trending', generation);
    const boxOffice = useMovieList('boxOffice', generation);
    const comingSoon = useMovieList('comingSoon', generation);
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = () => {
        setRefreshing(true);
        setGeneration((g) => g + 1);
        // Sections show their previous data while reloading, so the spinner is only a cue
        setTimeout(() => setRefreshing(false), 600);
    };

    return (
        <View style={styles.container}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
                contentInsetAdjustmentBehavior="never"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
            >
                <HeroBanner movie={trending.data?.[0]} />
                <NotificationPrompt />

                {CATEGORY_ROWS.map((id) => (
                    <CategoryRow key={id} id={id} generation={generation} />
                ))}

                <MovieListRow title={t('trending')} state={trending} skipFirst />
                <MovieListRow title={t('boxOffice')} state={boxOffice} ranked />
                <MovieListRow title={t('comingSoon')} state={comingSoon} />

                <Text style={styles.attribution}>{t('shoofAttribution')}</Text>
            </ScrollView>
        </View>
    );
}

function CategoryRow({ id, generation }: { id: CategoryId; generation: number }) {
    const { t } = useTranslation();
    const router = useRouter();
    const { data, status, retry } = useAsync((signal) => fetchHomeRow(id, signal), `${id}:${generation}`);
    return (
        <ContentRow
            title={t(CATEGORIES[id].title)}
            items={data}
            status={status}
            onRetry={retry}
            onSeeAll={() => router.push({ pathname: '/browse/[category]', params: { category: id } })}
        />
    );
}

function useMovieList(list: HomeMovieList, generation: number) {
    return useAsync((signal) => fetchHomeMovieList(list, signal), `${list}:${generation}`);
}

type MovieListRowProps = {
    title: string;
    state: ReturnType<typeof useMovieList>;
    ranked?: boolean;
    // The hero already shows the first trending movie
    skipFirst?: boolean;
};

function MovieListRow({ title, state: { data, status }, ranked, skipFirst }: MovieListRowProps) {
    const movies = (skipFirst ? data?.slice(1) : data) ?? [];
    // Trakt-only rows simply hide on failure; the category rows above carry retry
    if (status === 'error' && !movies.length) return null;
    return <MovieRow title={title} movies={movies} loading={status === 'loading' && !data} ranked={ranked} />;
}

const createStyles = (c: Colors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    attribution: { color: c.textFaint, fontSize: 11, textAlign: 'center', marginHorizontal: 24, marginTop: 8 },
});
