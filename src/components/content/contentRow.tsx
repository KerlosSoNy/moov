import ContentCard from '@/components/content/contentCard';
import type { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import type { ContentItem } from '@/types/content';
import Feather from '@expo/vector-icons/Feather';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

type ContentRowProps = {
    title: string;
    items: ContentItem[] | undefined;
    status: 'loading' | 'error' | 'ready';
    onRetry?: () => void;
    onSeeAll?: () => void;
};

const SKELETON_COUNT = 4;

export default function ContentRow({ title, items, status, onRetry, onSeeAll }: ContentRowProps) {
    const { colors } = useTheme();
    const { t, isRTL } = useTranslation();
    const styles = createStyles(colors);
    const loading = status === 'loading' && !items;

    if (status === 'ready' && !items?.length) return null;

    return (
        <View style={styles.section}>
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                {onSeeAll && (
                    <Pressable onPress={onSeeAll} hitSlop={8} accessibilityRole="link" style={styles.seeAll}>
                        <Text style={styles.seeAllText}>{t('seeAll')}</Text>
                        <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={16} color={colors.link} />
                    </Pressable>
                )}
            </View>
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
            ) : status === 'error' && !items?.length ? (
                // Only this row shows the failure; the rest of the screen stays usable
                <View style={styles.error}>
                    <Text style={styles.errorText}>{t('sectionError')}</Text>
                    {onRetry && (
                        <Pressable onPress={onRetry} accessibilityRole="button">
                            {({ pressed }) => (
                                <View style={[styles.retry, pressed && { opacity: 0.8 }]}>
                                    <Text style={styles.retryText}>{t('retry')}</Text>
                                </View>
                            )}
                        </Pressable>
                    )}
                </View>
            ) : (
                <FlatList
                    horizontal
                    data={items}
                    keyExtractor={(item) => item.key}
                    renderItem={({ item }) => <ContentCard item={item} />}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16 }}
                    initialNumToRender={4}
                    windowSize={5}
                />
            )}
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    section: { marginBottom: 24 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 12, gap: 12 },
    title: { color: c.text, fontSize: 22, fontWeight: '700', flexShrink: 1 },
    seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    seeAllText: { color: c.link, fontSize: 15, fontWeight: '600' },
    skeletonRow: { flexDirection: 'row', paddingHorizontal: 16, overflow: 'hidden' },
    skeletonCard: { width: 140, marginRight: 14 },
    skeletonPoster: { width: 140, height: 210, borderRadius: 14, backgroundColor: c.surface },
    skeletonLine: { width: 110, height: 12, borderRadius: 6, backgroundColor: c.surface, marginTop: 8 },
    error: { marginHorizontal: 16, padding: 16, borderRadius: 14, backgroundColor: c.surface, alignItems: 'center', gap: 10 },
    errorText: { color: c.textMuted, fontSize: 14 },
    retry: { backgroundColor: c.fill, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
    retryText: { color: c.text, fontWeight: '600' },
});
