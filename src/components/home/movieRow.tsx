import MovieCard from '@/components/MovieCard/MovieCard';
import type { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import type { Movie } from '@/types/movie';
import { FlatList, StyleSheet, Text, View } from 'react-native';

type MovieRowProps = {
    title: string;
    movies: Movie[];
    loading?: boolean;
    // Shows a large rank number beside each poster (e.g. box office top 10)
    ranked?: boolean;
};

const SKELETON_COUNT = 4;

export default function MovieRow({ title, movies, loading, ranked }: MovieRowProps) {
    const { colors } = useTheme();
    const { direction } = useTranslation();
    const styles = createStyles(colors);

    if (!loading && movies.length === 0) return null;

    return (
        <View style={styles.section}>
            <Text style={styles.title}>{title}</Text>
            {loading ? (
                <View style={styles.skeletonRow}>
                    {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                        <View key={i} style={styles.skeletonCard}>
                            <View style={styles.skeletonPoster} />
                            <View style={styles.skeletonLine} />
                            <View style={[styles.skeletonLine, { width: 50 }]} />
                        </View>
                    ))}
                </View>
            ) : (
                <FlatList
                    key={direction}
                    horizontal
                    data={movies}
                    keyExtractor={(movie) => String(movie.ids.trakt)}
                    renderItem={({ item, index }) =>
                        ranked ? (
                            <View style={styles.rankedItem}>
                                <Text style={styles.rank}>{index + 1}</Text>
                                <MovieCard movie={item} />
                            </View>
                        ) : (
                            <MovieCard movie={item} />
                        )
                    }
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16 }}
                />
            )}
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    section: { marginBottom: 24 },
    title: { color: c.text, fontSize: 22, fontWeight: '700', marginHorizontal: 16, marginBottom: 12 },
    skeletonRow: { flexDirection: 'row', paddingHorizontal: 16, overflow: 'hidden' },
    skeletonCard: { width: 140, marginRight: 14 },
    skeletonPoster: { width: 140, height: 210, borderRadius: 14, backgroundColor: c.surface },
    skeletonLine: { width: 110, height: 12, borderRadius: 6, backgroundColor: c.surface, marginTop: 8 },
    rankedItem: { flexDirection: 'row', alignItems: 'flex-end' },
    rank: {
        color: c.rank,
        fontSize: 72,
        fontWeight: '900',
        lineHeight: 80,
        marginRight: -6,
        marginBottom: 36,
    },
});
