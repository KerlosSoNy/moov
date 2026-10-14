import type { Colors } from '@/constants/theme';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { fetchCommunityRating, setCommunityRating, type CommunityRating as Rating } from '@/services/community/ratings';
import type { ContentRef } from '@/types/content';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

const STARS = [1, 2, 3, 4, 5];

// Moov users' own 1–5 star rating, shown apart from the provider's 0–10 score
export default function CommunityRating({ content }: { content: ContentRef }) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);
    const remote = useAsync(() => fetchCommunityRating(content), `rating:${content.provider}:${content.type}:${content.id}`);
    // Latest value from a save, which supersedes the initial fetch
    const [saved, setSaved] = useState<Rating | null>(null);
    const [saving, setSaving] = useState(false);
    const rating = saved ?? remote.data;

    const rate = async (value: number | null) => {
        if (saving) return;
        setSaving(true);
        try {
            setSaved(await setCommunityRating(content, value));
        } catch (e) {
            console.warn(e);
            Alert.alert(t('ratingFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <Text style={styles.label}>{t('communityRating')}</Text>
                {remote.status === 'loading' && !rating ? (
                    <ActivityIndicator size="small" color={colors.textMuted} />
                ) : remote.status === 'error' && !rating ? (
                    <Pressable onPress={remote.retry} hitSlop={8}>
                        <Text style={{ color: colors.link }}>{t('retry')}</Text>
                    </Pressable>
                ) : (
                    <Text style={styles.summary}>
                        {rating?.average !== null && rating?.average !== undefined
                            ? `★ ${rating.average.toFixed(1)}/5 · ${t(rating.count === 1 ? 'ratingCountOne' : 'ratingCount').replace('{n}', String(rating.count))}`
                            : t('noRatingsYet')}
                    </Text>
                )}
            </View>
            <View style={styles.row}>
                <Text style={styles.yours}>{t('yourRating')}</Text>
                <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={t('yourRating')} accessibilityValue={{ min: 0, max: 5, now: rating?.mine ?? 0 }}>
                    {STARS.map((value) => {
                        const filled = (rating?.mine ?? 0) >= value;
                        return (
                            <Pressable
                                key={value}
                                onPress={() => rate(value)}
                                disabled={saving || !rating}
                                hitSlop={4}
                                accessibilityRole="button"
                                accessibilityLabel={t('rateStars').replace('{n}', String(value))}
                            >
                                <FontAwesome name={filled ? 'star' : 'star-o'} size={24} color={filled ? colors.rating : colors.textMuted} />
                            </Pressable>
                        );
                    })}
                </View>
                {rating?.mine ? (
                    <Pressable onPress={() => rate(null)} disabled={saving} hitSlop={8} accessibilityRole="button">
                        <Text style={{ color: colors.link, fontSize: 13 }}>{t('removeRating')}</Text>
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    card: { marginHorizontal: 16, padding: 14, borderRadius: 16, backgroundColor: c.surface, gap: 10 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    label: { color: c.text, fontWeight: '700', fontSize: 15 },
    summary: { color: c.textMuted, fontSize: 13, flexShrink: 1, textAlign: 'right' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    yours: { color: c.textMuted, fontSize: 13 },
    stars: { flexDirection: 'row', gap: 6 },
});
