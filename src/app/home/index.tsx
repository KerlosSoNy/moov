import HeroBanner from '@/components/home/heroBanner';
import MovieRow from '@/components/home/movieRow';
import type { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { fetchHomeMovies, type HomeMovies } from '@/services/home/homeMovies';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

const EMPTY: HomeMovies = { trending: [], popular: [], boxOffice: [], comingSoon: [] };

export default function HomeScreen() {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);
    const [data, setData] = useState<HomeMovies>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(false);

    const load = useCallback(async (signal?: AbortSignal) => {
        try {
            setData(await fetchHomeMovies(signal));
            setError(false);
        } catch (e) {
            if (!signal?.aborted) {
                console.error(e);
                setError(true);
            }
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        fetchHomeMovies(controller.signal)
            .then(setData)
            .catch((e) => {
                if (controller.signal.aborted) return;
                console.error(e);
                setError(true);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }, [load]);

    const retry = useCallback(async () => {
        setLoading(true);
        await load();
        setLoading(false);
    }, [load]);

    return (
        <View style={styles.container}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
                contentInsetAdjustmentBehavior="never"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
            >
                <HeroBanner movie={data.trending[0]} />

                {error && !loading ? (
                    <View style={styles.error}>
                        <Text style={styles.errorText}>{t('homeError')}</Text>
                        <Pressable onPress={retry} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.8 }]}>
                            <Text style={styles.retryText}>{t('retry')}</Text>
                        </Pressable>
                    </View>
                ) : (
                    <>
                        <MovieRow title={t('trending')} movies={data.trending.slice(1)} loading={loading} />
                        <MovieRow title={t('popular')} movies={data.popular} loading={loading} />
                        <MovieRow title={t('boxOffice')} movies={data.boxOffice} loading={loading} ranked />
                        <MovieRow title={t('comingSoon')} movies={data.comingSoon} loading={loading} />
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    error: { alignItems: 'center', paddingVertical: 40, gap: 12 },
    errorText: { color: c.textMuted, fontSize: 15 },
    retry: { backgroundColor: c.surface, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
    retryText: { color: c.text, fontWeight: '600' },
});
