import type { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { defaultScheduleTime, formatDay, formatTime } from '@/lib/dateFormat';
import { useNotifications } from '@/providers/notifications';
import { useSchedule } from '@/providers/schedule';
import { hasReminder } from '@/services/schedule/schedule';
import { displayTitle, type ContentItem } from '@/types/content';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import Feather from '@expo/vector-icons/Feather';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ScheduleSheetProps = {
    item: ContentItem;
    onClose: () => void;
};

// Keeps the time of `base` and takes the calendar day of `day`, or the reverse
const withDay = (base: Date, day: Date) => {
    const next = new Date(base);
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    return next;
};
const withTime = (base: Date, time: Date) => {
    const next = new Date(base);
    next.setHours(time.getHours(), time.getMinutes(), 0, 0);
    return next;
};

// Mount only while open: each opening starts from the saved entry (or a default)
export default function ScheduleSheet({ item, onClose }: ScheduleSheetProps) {
    const { t, language } = useTranslation();
    const { colors, scheme } = useTheme();
    const insets = useSafeAreaInsets();
    const styles = createStyles(colors);
    const { entryFor, schedule, unschedule } = useSchedule();
    const { permission, enable } = useNotifications();
    const existing = entryFor(item);

    // When the sheet opened: for rendering; save re-checks against the real clock
    const [openedAt] = useState(() => Date.now());
    const [at, setAt] = useState(() => existing?.scheduledAt ?? defaultScheduleTime(new Date(openedAt)));
    const [pastAtSave, setPastAtSave] = useState(false);
    const [remind, setRemind] = useState(permission === 'granted');
    const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
    // Android shows date and time as separate dialogs
    const [androidPicker, setAndroidPicker] = useState<'date' | 'time' | null>(null);

    // An existing entry keeps whatever reminder state it was saved with
    useEffect(() => {
        if (!existing) return;
        let stale = false;
        hasReminder(existing.id).then((on) => !stale && setRemind(on));
        return () => {
            stale = true;
        };
    }, [existing]);

    const inPast = pastAtSave || at.getTime() < openedAt + 60_000;
    const title = displayTitle(item, language);

    const save = async () => {
        if (at.getTime() < Date.now() + 60_000) {
            setPastAtSave(true);
            return;
        }
        setBusy('save');
        try {
            let reminder = remind;
            if (reminder && permission !== 'granted') {
                reminder = (await enable()) === 'granted';
                if (!reminder) Alert.alert(t('reminderNeedsPermission'));
            }
            await schedule(
                item,
                at,
                reminder ? { title: t('reminderTitle'), body: t('reminderBody').replace('{title}', title) } : null,
            );
            onClose();
        } catch (e) {
            console.warn(e);
            Alert.alert(t('scheduleFailed'));
        } finally {
            setBusy(null);
        }
    };

    const remove = async () => {
        if (!existing) return;
        setBusy('remove');
        try {
            await unschedule(existing);
            onClose();
        } catch (e) {
            console.warn(e);
            Alert.alert(t('scheduleFailed'));
        } finally {
            setBusy(null);
        }
    };

    const today = new Date(openedAt);
    today.setHours(0, 0, 0, 0);

    return (
        <Modal visible transparent animationType="slide" onRequestClose={onClose}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.backdrop }]} onPress={onClose} accessibilityLabel={t('close')} />
                <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>{t(existing ? 'editSchedule' : 'addToSchedule')}</Text>
                            <Text style={styles.subtitle} numberOfLines={1}>{title}</Text>
                        </View>
                        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('close')}>
                            <Feather name="x" size={22} color={colors.text} />
                        </Pressable>
                    </View>

                    <View style={styles.card}>
                        {Platform.OS === 'ios' ? (
                            <View style={styles.row}>
                                <Text style={styles.label}>{t('scheduleWhen')}</Text>
                                <DateTimePicker
                                    value={at}
                                    mode="datetime"
                                    display="compact"
                                    minimumDate={today}
                                    accentColor={colors.accent}
                                    themeVariant={scheme}
                                    locale={language === 'ar' ? 'ar_EG' : 'en_US'}
                                    onValueChange={(_, date) => {
                                        setAt(date);
                                        setPastAtSave(false);
                                    }}
                                    style={{ flex: 1 }}
                                />
                            </View>
                        ) : (
                            <>
                                <PickerRow label={t('scheduleDate')} value={formatDay(at, language)} onPress={() => setAndroidPicker('date')} styles={styles} colors={colors} />
                                <View style={styles.divider} />
                                <PickerRow label={t('scheduleTime')} value={formatTime(at, language)} onPress={() => setAndroidPicker('time')} styles={styles} colors={colors} />
                                {androidPicker && (
                                    // Opens as a dialog on mount; unmounted once the user picks or cancels
                                    <DateTimePicker
                                        value={at}
                                        mode={androidPicker}
                                        minimumDate={androidPicker === 'date' ? today : undefined}
                                        accentColor={colors.accent}
                                        onValueChange={(_, date) => {
                                            setAt((current) => (androidPicker === 'date' ? withDay(current, date) : withTime(current, date)));
                                            setPastAtSave(false);
                                            setAndroidPicker(null);
                                        }}
                                        onDismiss={() => setAndroidPicker(null)}
                                    />
                                )}
                            </>
                        )}
                        <View style={styles.divider} />
                        <View style={styles.row}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.label}>{t('remindMe')}</Text>
                                <Text style={styles.hint}>
                                    {permission === 'denied' ? t('reminderNeedsPermission') : t('remindMeHint')}
                                </Text>
                            </View>
                            <Switch value={remind} onValueChange={setRemind} disabled={permission === 'denied' || permission === 'unsupported'} />
                        </View>
                    </View>

                    {inPast && <Text style={styles.error}>{t('pickFutureTime')}</Text>}

                    <Pressable onPress={save} disabled={!!busy || inPast} accessibilityRole="button">
                        {({ pressed }) => (
                            <View style={[styles.primary, { opacity: inPast ? 0.4 : pressed ? 0.8 : 1 }]}>
                                {busy === 'save' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t(existing ? 'saveSchedule' : 'addToSchedule')}</Text>}
                            </View>
                        )}
                    </Pressable>
                    {existing && (
                        <Pressable onPress={remove} disabled={!!busy} accessibilityRole="button">
                            {({ pressed }) => (
                                <View style={[styles.secondary, pressed && { opacity: 0.7 }]}>
                                    {busy === 'remove' ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.secondaryText}>{t('removeFromSchedule')}</Text>}
                                </View>
                            )}
                        </Pressable>
                    )}
                </View>
            </View>
        </Modal>
    );
}

type PickerRowProps = {
    label: string;
    value: string;
    onPress: () => void;
    styles: ReturnType<typeof createStyles>;
    colors: Colors;
};

function PickerRow({ label, value, onPress, styles, colors }: PickerRowProps) {
    return (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
            {({ pressed }) => (
                <View style={[styles.row, pressed && { backgroundColor: colors.fill }]}>
                    <Text style={styles.label}>{label}</Text>
                    <View style={styles.valueChip}>
                        <Text style={styles.valueText}>{value}</Text>
                    </View>
                </View>
            )}
        </Pressable>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    title: { color: c.text, fontSize: 20, fontWeight: '700' },
    subtitle: { color: c.textMuted, marginTop: 2 },
    card: { backgroundColor: c.fill, borderRadius: 14, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 52 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginHorizontal: 14 },
    label: { color: c.text, fontSize: 16, fontWeight: '600' },
    hint: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    valueChip: { backgroundColor: c.fillPressed, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    valueText: { color: c.text, fontWeight: '600' },
    error: { color: c.danger, fontSize: 13 },
    primary: { height: 50, borderRadius: 25, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    secondary: { height: 44, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.danger, fontSize: 15, fontWeight: '600' },
});
