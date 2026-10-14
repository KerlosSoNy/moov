import SearchMessage from '@/components/search/searchMessage';
import type { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { contentHref } from '@/lib/contentRoutes';
import { formatDay, formatTime } from '@/lib/dateFormat';
import { useSchedule } from '@/providers/schedule';
import type { ScheduleEntry } from '@/services/schedule/schedule';
import { displayTitle } from '@/types/content';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const fallback = require('../../../assets/image/loading.png');
const TAB_BAR_SPACE = 120;

export default function ScheduleScreen() {
    const { t, language } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);
    const router = useRouter();
    const { entries, status, unschedule, reload } = useSchedule();
    // Captured on mount so render stays pure; the list re-splits on each visit
    const [now] = useState(() => Date.now());

    const upcoming = entries.filter((e) => e.scheduledAt.getTime() >= now);
    // Most recent first
    const past = entries.filter((e) => e.scheduledAt.getTime() < now).reverse();
    const sections = [
        { key: 'upcoming', title: t('upcoming'), data: upcoming },
        { key: 'past', title: t('pastSchedule'), data: past },
    ].filter((s) => s.data.length);

    const open = (entry: ScheduleEntry) =>
        router.push(contentHref({ provider: entry.provider, type: entry.type, id: entry.contentId, slug: entry.slug }));

    const confirmRemove = (entry: ScheduleEntry) =>
        Alert.alert(t('removeFromSchedule'), displayTitle(entry, language), [
            { text: t('cancel'), style: 'cancel' },
            {
                text: t('remove'),
                style: 'destructive',
                onPress: () => unschedule(entry).catch(() => Alert.alert(t('scheduleFailed'))),
            },
        ]);

    const body = () => {
        if (status === 'loading') {
            return <View style={styles.center}><ActivityIndicator color={colors.text} /></View>;
        }
        if (status === 'error') {
            return <SearchMessage icon="alert-circle" message={t('scheduleLoadError')} actionLabel={t('retry')} onAction={reload} />;
        }
        if (!entries.length) {
            return <SearchMessage icon="calendar" message={t('scheduleEmpty')} />;
        }
        return (
            <SectionList
                sections={sections}
                keyExtractor={(entry) => entry.id}
                stickySectionHeadersEnabled={false}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE }}
                renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
                renderItem={({ item: entry, section }) => {
                    const past = section.key === 'past';
                    return (
                        <Pressable onPress={() => open(entry)} onLongPress={() => confirmRemove(entry)} accessibilityRole="button">
                            {({ pressed }) => (
                                <View style={[styles.row, pressed && { backgroundColor: colors.fillPressed }, past && { opacity: 0.6 }]}>
                                    <View style={styles.dateBox}>
                                        <Text style={styles.dateDay}>{formatDay(entry.scheduledAt, language)}</Text>
                                        <Text style={styles.dateTime}>{formatTime(entry.scheduledAt, language)}</Text>
                                    </View>
                                    <Image source={entry.poster ? { uri: entry.poster } : fallback} style={styles.poster} contentFit="cover" transition={200} />
                                    <View style={{ flex: 1, gap: 2 }}>
                                        <Text style={styles.title} numberOfLines={2}>{displayTitle(entry, language)}</Text>
                                        <Text style={styles.meta}>{t(entry.type === 'series' ? 'seriesBadge' : 'movieBadge')}</Text>
                                    </View>
                                    <Pressable onPress={() => confirmRemove(entry)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('removeFromSchedule')}>
                                        <Feather name="trash-2" size={18} color={colors.textMuted} />
                                    </Pressable>
                                </View>
                            )}
                        </Pressable>
                    );
                }}
            />
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.heading}>{t('schedule')}</Text>
                <Text style={styles.subheading}>{t('scheduleSubtitle')}</Text>
            </View>
            {body()}
        </SafeAreaView>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4, gap: 4 },
    heading: { color: c.text, fontSize: 30, fontWeight: '700' },
    subheading: { color: c.textMuted },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    sectionTitle: { color: c.text, fontSize: 18, fontWeight: '700', marginTop: 18, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, backgroundColor: c.surface, marginBottom: 10 },
    dateBox: { width: 74, alignItems: 'center', gap: 2 },
    dateDay: { color: c.accent, fontWeight: '700', fontSize: 12, textAlign: 'center' },
    dateTime: { color: c.text, fontWeight: '800', fontSize: 15 },
    poster: { width: 46, height: 69, borderRadius: 8, backgroundColor: c.fill },
    title: { color: c.text, fontWeight: '600', fontSize: 15 },
    meta: { color: c.textMuted, fontSize: 12 },
});
