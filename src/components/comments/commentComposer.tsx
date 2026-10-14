import type { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { COMMENT_MAX_LENGTH, communityErrorKey } from '@/services/community/comments';
import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type CommentComposerProps = {
    onSubmit: (content: string) => Promise<unknown>;
    initialValue?: string;
    placeholder?: string;
    // Shown above the input, e.g. "Replying to Sara" / "Editing"
    contextLabel?: string;
    onCancel?: () => void;
    autoFocus?: boolean;
};

export default function CommentComposer({ onSubmit, initialValue = '', placeholder, contextLabel, onCancel, autoFocus }: CommentComposerProps) {
    const { t, isRTL }:any = useTranslation();
    const { colors, scheme } = useTheme();
    const styles = createStyles(colors);
    const [value, setValue] = useState(initialValue);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const trimmed = value.trim();
    const tooLong = trimmed.length > COMMENT_MAX_LENGTH;
    const unchanged = !!initialValue && trimmed === initialValue.trim();
    const canSend = trimmed.length > 0 && !tooLong && !unchanged && !sending;
    const nearLimit = trimmed.length > COMMENT_MAX_LENGTH * 0.9;

    const submit = async () => {
        if (!canSend) return;
        setSending(true);
        setError(null);
        try {
            await onSubmit(trimmed);
            setValue('');
        } catch (e) {
            setError(t(communityErrorKey(e)));
        } finally {
            setSending(false);
        }
    };

    return (
        <View style={styles.container}>
            {(contextLabel || onCancel) && (
                <View style={styles.context}>
                    <Text style={styles.contextText} numberOfLines={1}>{contextLabel}</Text>
                    {onCancel && (
                        <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('cancel')}>
                            <Feather name="x" size={16} color={colors.textMuted} />
                        </Pressable>
                    )}
                </View>
            )}
            <View style={styles.row}>
                <TextInput
                    value={value}
                    onChangeText={(text) => {
                        setValue(text);
                        if (error) setError(null);
                    }}
                    placeholder={placeholder ?? t('commentPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
                    // Still wraps long text, but the return key sends instead of adding a line
                    multiline
                    submitBehavior="submit"
                    returnKeyType="send"
                    onSubmitEditing={submit}
                    enablesReturnKeyAutomatically
                    maxLength={COMMENT_MAX_LENGTH + 100}
                    autoFocus={autoFocus}
                    keyboardAppearance={scheme}
                    selectionColor={colors.text}
                    accessibilityLabel={placeholder ?? t('commentPlaceholder')}
                />
                <Pressable
                    onPress={submit}
                    disabled={!canSend}
                    accessibilityRole="button"
                    accessibilityLabel={t('send')}
                    accessibilityState={{ disabled: !canSend }}
                >
                    {({ pressed }) => (
                        // Styled on a plain View: Pressable style callbacks aren't applied in this setup
                        <View className="" >
                            {sending ? (
                                <ActivityIndicator size="small" color="#1c1c1e" />
                            ) : (
                                <Feather name="send" size={16} color="#1c1c1e" style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
                            )}
                        </View>
                    )}
                </Pressable>
            </View>
            {(nearLimit || error) && (
                <Text style={[styles.meta, (tooLong || error) && { color: colors.danger }]}>
                    {error ?? `${trimmed.length}/${COMMENT_MAX_LENGTH}`}
                </Text>
            )}
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    container: { gap: 6 },
    context: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 4 },
    contextText: { color: c.textMuted, fontSize: 13, flexShrink: 1 },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    input: {
        flex: 1,
        minHeight: 44,
        maxHeight: 140,
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        backgroundColor: c.fill,
        color: c.text,
        fontSize: 15,
    },
    send: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    meta: { color: c.textMuted, fontSize: 12, paddingHorizontal: 8 },
});
