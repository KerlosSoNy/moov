import CommentComposer from '@/components/comments/commentComposer';
import CommentWithReplies from '@/components/comments/commentReplies';
import ReportSheet from '@/components/comments/reportSheet';
import type { Colors } from '@/constants/theme';
import { useAsync } from '@/hooks/useAsync';
import { useCommentThread } from '@/hooks/useComments';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { fetchCommentCount } from '@/services/community/comments';
import type { ContentRef } from '@/types/content';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

export default function CommentsSection({ content }: { content: ContentRef }) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);
    const thread = useCommentThread(content, null);
    const count = useAsync(() => fetchCommentCount(content), `count:${content.provider}:${content.type}:${content.id}`);
    // Local adjustment on top of the server count, so posting updates the header at once
    const [delta, setDelta] = useState(0);
    const [reporting, setReporting] = useState<string | null>(null);
    const total = count.data !== undefined ? Math.max(0, count.data + delta) : null;

    return (
        <View style={styles.section}>
            <Text style={styles.title}>
                {t('comments')}
                {total !== null && total > 0 ? <Text style={styles.count}>  {total}</Text> : null}
            </Text>

            <CommentComposer
                onSubmit={async (text) => {
                    await thread.add(text, null);
                    setDelta((d) => d + 1);
                }}
            />

            {thread.status === 'loading' ? (
                <ActivityIndicator color={colors.textMuted} style={{ marginVertical: 16 }} />
            ) : thread.status === 'error' && !thread.comments.length ? (
                <View style={styles.message}>
                    <Text style={styles.messageText}>{t('commentsError')}</Text>
                    <Pressable onPress={thread.reload} style={styles.retry} accessibilityRole="button">
                        <Text style={{ color: colors.text, fontWeight: '600' }}>{t('retry')}</Text>
                    </Pressable>
                </View>
            ) : !thread.comments.length ? (
                <Text style={[styles.messageText, { marginVertical: 12 }]}>{t('commentsEmpty')}</Text>
            ) : (
                <View style={{ gap: 20, marginTop: 8 }}>
                    {thread.comments.map((comment) => (
                        <CommentWithReplies
                            key={comment.id}
                            content={content}
                            comment={comment}
                            thread={{
                                ...thread,
                                remove: async (id) => {
                                    await thread.remove(id);
                                    setDelta((d) => d - 1);
                                },
                            }}
                            onReport={(c) => setReporting(c.id)}
                        />
                    ))}
                    {thread.status === 'loadingMore' ? (
                        <ActivityIndicator color={colors.textMuted} />
                    ) : thread.hasMore || thread.status === 'error' ? (
                        <Pressable onPress={thread.status === 'error' ? thread.reload : thread.loadMore} style={styles.more} accessibilityRole="button">
                            <Text style={{ color: colors.link, fontWeight: '600' }}>
                                {t(thread.status === 'error' ? 'retry' : 'moreComments')}
                            </Text>
                        </Pressable>
                    ) : null}
                </View>
            )}

            <ReportSheet commentId={reporting} onClose={() => setReporting(null)} />
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    section: { paddingHorizontal: 16, gap: 12 },
    title: { color: c.text, fontSize: 18, fontWeight: '700' },
    count: { color: c.textMuted, fontWeight: '600' },
    message: { alignItems: 'center', gap: 10, paddingVertical: 12 },
    messageText: { color: c.textMuted, textAlign: 'center' },
    retry: { backgroundColor: c.fill, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
    more: { alignItems: 'center', paddingVertical: 8 },
});
