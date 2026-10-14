import ScheduleSheet from '@/components/schedule/scheduleSheet';
import type { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { formatDayTime } from '@/lib/dateFormat';
import { useSchedule } from '@/providers/schedule';
import type { ContentItem } from '@/types/content';
import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// "Add to schedule", or the scheduled time once set; opens the date/time sheet
export default function ScheduleButton({ item }: { item: ContentItem }) {
    const { t, language } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);
    const { entryFor } = useSchedule();
    const [open, setOpen] = useState(false);
    const entry = entryFor(item);

    return (
        <>
            <Pressable
                onPress={() => setOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={entry ? `${t('scheduledFor')} ${formatDayTime(entry.scheduledAt, language)}` : t('addToSchedule')}
            >
                {({ pressed }) => (
                    <View style={[styles.button, entry && styles.scheduled, pressed && { opacity: 0.8 }]}>
                        <View style={[styles.icon, { backgroundColor: entry ? colors.accent : colors.fillPressed }]}>
                            <Feather name={entry ? 'check' : 'calendar'} size={16} color={entry ? '#fff' : colors.text} />
                        </View>
                        <View style={{ flexShrink: 1 }}>
                            <Text style={styles.label} numberOfLines={1}>{t(entry ? 'scheduledFor' : 'addToSchedule')}</Text>
                            {entry && <Text style={styles.when} numberOfLines={1}>{formatDayTime(entry.scheduledAt, language)}</Text>}
                        </View>
                    </View>
                )}
            </Pressable>
            {open && <ScheduleSheet item={item} onClose={() => setOpen(false)} />}
        </>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        alignSelf: 'flex-start',
        paddingStart: 6,
        paddingEnd: 16,
        paddingVertical: 6,
        borderRadius: 24,
        backgroundColor: c.surface,
    },
    scheduled: { borderWidth: 1, borderColor: c.accent },
    icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    label: { color: c.text, fontWeight: '700', fontSize: 15 },
    when: { color: c.textMuted, fontSize: 12, marginTop: 1 },
});
