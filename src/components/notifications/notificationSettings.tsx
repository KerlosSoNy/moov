import type { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { useNotifications } from '@/providers/notifications';
import type { NotificationPreferences } from '@/services/notifications/preferences';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

export default function NotificationSettings() {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);
    const { permission, preferences, updatePreferences, enable } = useNotifications();
    const [busy, setBusy] = useState(false);

    const toggle = (key: keyof Pick<NotificationPreferences, 'dailyDiscovery' | 'commentReplies'>) => (value: boolean) =>
        updatePreferences({ [key]: value }).catch(() => Alert.alert(t('saveFailed')));

    const turnOn = async () => {
        setBusy(true);
        try {
            await enable();
        } catch {
            Alert.alert(t('notificationsFailed'));
        } finally {
            setBusy(false);
        }
    };

    const deviceStatus = () => {
        switch (permission) {
            case null:
                return <ActivityIndicator size="small" color={colors.textMuted} />;
            case 'granted':
                return <Text style={styles.statusOn}>{t('notificationsOn')}</Text>;
            case 'unsupported':
                return <Text style={styles.statusMuted}>{t('notificationsUnsupported')}</Text>;
            case 'denied':
                // The OS won't prompt again; only system settings can re-enable
                return (
                    <Pressable onPress={() => Linking.openSettings()} hitSlop={8} accessibilityRole="button">
                        <Text style={styles.link}>{t('openSystemSettings')}</Text>
                    </Pressable>
                );
            default:
                return (
                    <Pressable onPress={turnOn} disabled={busy} hitSlop={8} accessibilityRole="button">
                        {busy ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Text style={styles.link}>{t('turnOn')}</Text>}
                    </Pressable>
                );
        }
    };

    const rows: { key: 'dailyDiscovery' | 'commentReplies'; label: string; hint: string }[] = [
        { key: 'dailyDiscovery', label: t('dailyDiscovery'), hint: t('dailyDiscoveryHint') },
        { key: 'commentReplies', label: t('replyNotifications'), hint: t('replyNotificationsHint') },
    ];

    return (
        <View style={{ gap: 8 }}>
            <Text style={styles.label}>{t('notifications')}</Text>
            <View style={styles.card}>
                <View style={styles.row}>
                    <Text style={styles.rowTitle}>{t('pushOnThisDevice')}</Text>
                    {deviceStatus()}
                </View>
                {permission === 'denied' && <Text style={styles.hint}>{t('notificationsDeniedHint')}</Text>}
                {rows.map(({ key, label, hint }) => (
                    <View key={key} style={[styles.row, styles.divider]}>
                        <View style={{ flex: 1, gap: 2 }}>
                            <Text style={styles.rowTitle}>{label}</Text>
                            <Text style={styles.hint}>{hint}</Text>
                        </View>
                        <Switch
                            value={preferences?.[key] ?? true}
                            onValueChange={toggle(key)}
                            disabled={!preferences}
                            accessibilityLabel={label}
                        />
                    </View>
                ))}
                <Text style={[styles.hint, styles.divider, { paddingTop: 10 }]}>{t('notificationLanguageHint')}</Text>
            </View>
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    label: { color: c.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginTop: 16, paddingHorizontal: 4 },
    card: { backgroundColor: c.fill, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    rowTitle: { color: c.text, fontSize: 15, fontWeight: '600' },
    hint: { color: c.textMuted, fontSize: 12, paddingBottom: 6 },
    statusOn: { color: c.textSecondary, fontWeight: '600' },
    statusMuted: { color: c.textMuted, fontSize: 13 },
    link: { color: c.link, fontWeight: '600' },
});
