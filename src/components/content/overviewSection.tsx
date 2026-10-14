import type { Colors } from '@/constants/theme';
import { useAsync } from '@/hooks/useAsync';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { fetchOverview, tmdbConfigured } from '@/services/content/overview';
import type { ContentItem } from '@/types/content';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Description in the app language, falling back to the other one, with a
// switch when both exist
export default function OverviewSection({ item }: { item: ContentItem }) {
    const { t, language } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);
    const overview = useAsync((signal) => fetchOverview(item, signal), `overview:${item.key}`);
    const [shown, setShown] = useState<'ar' | 'en' | null>(null);

    const preferred = language === 'ar' ? 'ar' : 'en';
    const other = preferred === 'ar' ? 'en' : 'ar';
    // Trakt's English text is already on the item; show it while Arabic loads
    const data = overview.data ?? { ar: null, en: item.overview };
    const lang = shown ?? (data[preferred] ? preferred : other);
    const text = data[lang];
    const canSwitch = !!data.ar && !!data.en && data.ar !== data.en;

    // Without a TMDB key Shoof Aflam titles have no description source at all,
    // so the section is left out rather than showing a setup message
    if (item.provider === 'shoofaflam' && !tmdbConfigured) return null;

    const empty = t('noOverview');

    return (
        <View>
            <View style={styles.header}>
                <Text style={styles.heading}>{t('overview')}</Text>
                {canSwitch && (
                    <Pressable onPress={() => setShown(lang === 'ar' ? 'en' : 'ar')} hitSlop={8} accessibilityRole="button">
                        <Text style={styles.switch}>{t(lang === 'ar' ? 'showInEnglish' : 'showInArabic')}</Text>
                    </Pressable>
                )}
            </View>
            {overview.status === 'loading' && !text ? (
                <View style={{ gap: 8 }}>
                    <View style={styles.skeleton} />
                    <View style={styles.skeleton} />
                    <View style={[styles.skeleton, { width: '60%' }]} />
                </View>
            ) : text ? (
                <Text style={[styles.body, { writingDirection: lang === 'ar' ? 'rtl' : 'ltr', textAlign: lang === 'ar' ? 'right' : 'left' }]}>
                    {text}
                </Text>
            ) : (
                <Text style={styles.muted}>{overview.status === 'error' ? t('overviewError') : empty}</Text>
            )}
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    heading: { color: c.text, fontSize: 18, fontWeight: '700' },
    switch: { color: c.link, fontWeight: '600', fontSize: 13 },
    body: { color: c.textSecondary, lineHeight: 22 },
    muted: { color: c.textMuted, fontStyle: 'italic' },
    skeleton: { height: 12, borderRadius: 6, backgroundColor: c.surface },
});
