import CommentComposer from '@/components/comments/commentComposer';
import CommentItem from '@/components/comments/commentItem';
import { useTheme } from '@/hooks/useTheme';
import { useCommentThread, type CommentThread } from '@/hooks/useComments';
import { useTranslation } from '@/i18n/languageProvider';
import type { Comment } from '@/services/community/comments';
import type { ContentRef } from '@/types/content';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

type CommentWithRepliesProps = {
    content: ContentRef;
    comment: Comment;
    // The top-level list this comment belongs to
    thread: CommentThread;
    onReport: (comment: Comment) => void;
};

// A top-level comment, its replies (loaded on demand) and the reply composer
export default function CommentWithReplies({ content, comment, thread, onReport }: CommentWithRepliesProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const [expanded, setExpanded] = useState(false);
    const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
    const replies = useCommentThread(content, comment.id, { enabled: expanded });

    const startReply = (target: Comment) => {
        setReplyingTo(target);
        setExpanded(true);
    };

    const toggleLabel = expanded
        ? t('hideReplies')
        : t(comment.replyCount === 1 ? 'viewReply' : 'viewReplies').replace('{n}', String(comment.replyCount));

    return (
        <View style={{ gap: 12 }}>
            <CommentItem
                comment={comment}
                onLike={thread.toggleLike}
                onReply={comment.isDeleted ? undefined : startReply}
                onEdit={thread.edit}
                onDelete={thread.remove}
                onReport={onReport}
            />
            <View style={{ marginStart: 46, gap: 12 }}>
                {comment.replyCount > 0 && (
                    <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6} accessibilityRole="button">
                        <Text style={{ color: colors.link, fontWeight: '600', fontSize: 13 }}>{toggleLabel}</Text>
                    </Pressable>
                )}
                {expanded && (
                    <>
                        {replies.comments.map((reply) => (
                            <CommentItem
                                key={reply.id}
                                comment={reply}
                                compact
                                onLike={replies.toggleLike}
                                onReply={startReply}
                                onEdit={replies.edit}
                                onDelete={async (id) => {
                                    await replies.remove(id);
                                    thread.adjustReplyCount(comment.id, -1);
                                }}
                                onReport={onReport}
                            />
                        ))}
                        {replies.status === 'loading' || replies.status === 'loadingMore' ? (
                            <ActivityIndicator color={colors.textMuted} style={{ alignSelf: 'flex-start' }} />
                        ) : replies.status === 'error' ? (
                            <Pressable onPress={replies.reload} accessibilityRole="button">
                                <Text style={{ color: colors.danger, fontSize: 13 }}>{t('repliesError')}</Text>
                            </Pressable>
                        ) : replies.hasMore ? (
                            <Pressable onPress={replies.loadMore} accessibilityRole="button">
                                <Text style={{ color: colors.link, fontWeight: '600', fontSize: 13 }}>{t('moreReplies')}</Text>
                            </Pressable>
                        ) : null}
                    </>
                )}
                {replyingTo && (
                    <CommentComposer
                        key={replyingTo.id}
                        contextLabel={t('replyingTo').replace('{name}', replyingTo.authorName || t('unknownUser'))}
                        placeholder={t('replyPlaceholder')}
                        onCancel={() => setReplyingTo(null)}
                        autoFocus
                        onSubmit={async (text) => {
                            await replies.add(text, replyingTo.id);
                            thread.adjustReplyCount(comment.id, 1);
                            setReplyingTo(null);
                        }}
                    />
                )}
            </View>
        </View>
    );
}
