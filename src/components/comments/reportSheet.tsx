import type { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { TranslationKey } from '@/i18n/config';
import { useTranslation } from '@/i18n/languageProvider';
import {
    communityErrorKey,
    REPORT_DESCRIPTION_MAX,
    REPORT_REASONS,
    reportComment,
    type ReportReason,
} from '@/services/community/comments';
import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const REASON_LABELS: Record<ReportReason, TranslationKey> = {
    spam: 'reportSpam',
    harassment: 'reportHarassment',
    offensive: 'reportOffensive',
    spoilers: 'reportSpoilers',
    other: 'reportOther',
};

type ReportSheetProps = {
    commentId: string | null;
    onClose: () => void;
};

export default function ReportSheet({ commentId, onClose }: ReportSheetProps) {
    const { t, isRTL } = useTranslation();
    const { colors, scheme } = useTheme();
    const insets = useSafeAreaInsets();
    const styles = createStyles(colors);
    const [reason, setReason] = useState<ReportReason | null>(null);
    const [description, setDescription] = useState('');
    const [sending, setSending] = useState(false);

    const close = () => {
        setReason(null);
        setDescription('');
        onClose();
    };

    const submit = async () => {
        if (!commentId || !reason) return;
        setSending(true);
        try {
            await reportComment(commentId, reason, description);
            close();
            Alert.alert(t('reportSent'), t('reportSentMessage'));
        } catch (e) {
            Alert.alert(t('reportFailed'), t(communityErrorKey(e)));
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal visible={!!commentId} transparent animationType="slide" onRequestClose={close}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
                <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.backdrop }]} onPress={close} accessibilityLabel={t('close')} />
                <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{t('reportComment')}</Text>
                        <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('close')}>
                            <Feather name="x" size={22} color={colors.text} />
                        </Pressable>
                    </View>
                    <Text style={styles.subtitle}>{t('reportWhy')}</Text>
                    {REPORT_REASONS.map((value) => {
                        const selected = reason === value;
                        return (
                            <Pressable
                                key={value}
                                onPress={() => setReason(value)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected }}
                            >
                                {({ pressed }) => (
                                    <View style={[styles.option, (pressed || selected) && { backgroundColor: colors.fill }]}>
                                        <Feather name={selected ? 'check-circle' : 'circle'} size={18} color={selected ? colors.accent : colors.textMuted} />
                                        <Text style={styles.optionText}>{t(REASON_LABELS[value])}</Text>
                                    </View>
                                )}
                            </Pressable>
                        );
                    })}
                    <TextInput
                        value={description}
                        onChangeText={setDescription}
                        placeholder={t('reportDetailsPlaceholder')}
                        placeholderTextColor={colors.textMuted}
                        maxLength={REPORT_DESCRIPTION_MAX}
                        multiline
                        keyboardAppearance={scheme}
                        style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
                    />
                    <Pressable
                        onPress={submit}
                        disabled={!reason || sending}
                        accessibilityRole="button"
                    >
                        {({ pressed }) => (
                            <View style={[styles.submit, { opacity: !reason ? 0.4 : pressed ? 0.8 : 1 }]}>
                                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('sendReport')}</Text>}
                            </View>
                        )}
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 6 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: c.text, fontSize: 20, fontWeight: '700' },
    subtitle: { color: c.textMuted, marginBottom: 6 },
    option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 10, borderRadius: 12 },
    optionText: { color: c.text, fontSize: 16 },
    input: { minHeight: 70, borderRadius: 14, padding: 12, marginTop: 6, backgroundColor: c.fill, color: c.text, textAlignVertical: 'top' },
    submit: { marginTop: 10, height: 48, borderRadius: 24, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
