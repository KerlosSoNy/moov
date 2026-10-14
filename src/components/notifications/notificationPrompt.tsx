import type { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { useNotifications } from '@/providers/notifications';
import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

// Explains what notifications are for before the OS asks. Shown only while
// the system permission is undecided and until dismissed.
export default function NotificationPrompt() {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);
    const { permission, enable, promptDismissed, dismissPrompt } = useNotifications();
    const [busy, setBusy] = useState(false);

    if (permission !== 'undetermined' || promptDismissed) return null;

    const turnOn = async () => {
        setBusy(true);
        try {
            const result = await enable();
            if (result !== 'granted') dismissPrompt();
        } catch (e) {
            console.warn(e);
            Alert.alert(t('notificationsFailed'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <View style={styles.card}>
            <View style={styles.icon}>
                <Feather name="bell" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.title}>{t('notifPromptTitle')}</Text>
                <Text style={styles.body}>{t('notifPromptBody')}</Text>
                <View style={styles.actions}>
                    <Pressable onPress={turnOn} disabled={busy} accessibilityRole="button">
                        {({ pressed }) => (
                            <View style={[styles.primary, pressed && { opacity: 0.8 }]}>
                                {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryText}>{t('turnOn')}</Text>}
                            </View>
                        )}
                    </Pressable>
                    <Pressable onPress={dismissPrompt} accessibilityRole="button" hitSlop={8}>
                        <Text style={styles.secondaryText}>{t('notNow')}</Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    card: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 24, padding: 14, borderRadius: 16, backgroundColor: c.surface },
    icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' },
    title: { color: c.text, fontWeight: '700', fontSize: 15 },
    body: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
    primary: { backgroundColor: c.accent, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, minWidth: 80, alignItems: 'center' },
    primaryText: { color: '#fff', fontWeight: '700' },
    secondaryText: { color: c.textMuted, fontWeight: '600' },
});
