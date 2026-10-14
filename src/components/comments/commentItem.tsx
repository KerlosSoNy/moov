import CommentComposer from '@/components/comments/commentComposer';
import type { Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/languageProvider';
import { relativeTime } from '@/lib/relativeTime';
import { communityErrorKey, type Comment } from '@/services/community/comments';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

type CommentItemProps = {
    comment: Comment;
    onLike: (comment: Comment) => void;
    onReply?: (comment: Comment) => void;
    onEdit: (id: string, content: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onReport: (comment: Comment) => void;
    compact?: boolean;
};

export default function CommentItem({ comment, onLike, onReply, onEdit, onDelete, onReport, compact }: CommentItemProps) {
    const { t, language } = useTranslation();
    const { colors } = useTheme();
    const styles = createStyles(colors);
    const [editing, setEditing] = useState(false);
    const avatarSize = compact ? 28 : 36;

    if (comment.isDeleted) {
        return (
            <View style={styles.row}>
                <View style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]} />
                <Text style={styles.deleted}>{t(comment.deletedByModerator ? 'commentRemoved' : 'commentDeleted')}</Text>
            </View>
        );
    }

    const confirmDelete = () =>
        Alert.alert(t('deleteCommentTitle'), t('deleteCommentMessage'), [
            { text: t('cancel'), style: 'cancel' },
            {
                text: t('delete'),
                style: 'destructive',
                onPress: () => onDelete(comment.id).catch((e) => Alert.alert(t(communityErrorKey(e)))),
            },
        ]);

    const openMenu = () =>
        comment.isMine
            ? Alert.alert(t('commentOptions'), undefined, [
                  { text: t('edit'), onPress: () => setEditing(true) },
                  { text: t('delete'), style: 'destructive', onPress: confirmDelete },
                  { text: t('cancel'), style: 'cancel' },
              ])
            : Alert.alert(t('commentOptions'), undefined, [
                  { text: t('reportComment'), style: 'destructive', onPress: () => onReport(comment) },
                  { text: t('cancel'), style: 'cancel' },
              ]);

    return (
        <View style={styles.row}>
            {comment.authorAvatar ? (
                <Image source={{ uri: comment.authorAvatar }} style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]} />
            ) : (
                <View style={[styles.avatar, styles.initial, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}>
                    <Text style={styles.initialText}>{(comment.authorName || '?').slice(0, 1).toUpperCase()}</Text>
                </View>
            )}
            <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.header}>
                    <Text style={styles.author} numberOfLines={1}>{comment.authorName || t('unknownUser')}</Text>
                    <Text style={styles.time}>
                        {relativeTime(comment.createdAt, t, language)}
                        {comment.editedAt ? ` · ${t('edited')}` : ''}
                    </Text>
                </View>
                {editing ? (
                    <CommentComposer
                        initialValue={comment.content ?? ''}
                        contextLabel={t('editingComment')}
                        onCancel={() => setEditing(false)}
                        onSubmit={async (content) => {
                            await onEdit(comment.id, content);
                            setEditing(false);
                        }}
                        autoFocus
                    />
                ) : (
                    <Text style={styles.content} selectable>{comment.content}</Text>
                )}
                {!editing && (
                    <View style={styles.actions}>
                        <Pressable
                            onPress={() => onLike(comment)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityState={{ selected: comment.likedByMe }}
                            accessibilityLabel={t(comment.likedByMe ? 'unlike' : 'like')}
                            style={styles.action}
                        >
                            <FontAwesome name={comment.likedByMe ? 'heart' : 'heart-o'} size={14} color={comment.likedByMe ? colors.accent : colors.textMuted} />
                            {comment.likeCount > 0 && <Text style={styles.actionText}>{comment.likeCount}</Text>}
                        </Pressable>
                        {onReply && (
                            <Pressable onPress={() => onReply(comment)} hitSlop={8} accessibilityRole="button" style={styles.action}>
                                <Feather name="corner-up-left" size={14} color={colors.textMuted} />
                                <Text style={styles.actionText}>{t('reply')}</Text>
                            </Pressable>
                        )}
                        <Pressable onPress={openMenu} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('commentOptions')} style={styles.action}>
                            <Feather name="more-horizontal" size={16} color={colors.textMuted} />
                        </Pressable>
                    </View>
                )}
            </View>
        </View>
    );
}

const createStyles = (c: Colors) => StyleSheet.create({
    row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    avatar: { backgroundColor: c.fill },
    initial: { alignItems: 'center', justifyContent: 'center' },
    initialText: { color: c.textSecondary, fontWeight: '700' },
    header: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    author: { color: c.text, fontWeight: '700', flexShrink: 1 },
    time: { color: c.textMuted, fontSize: 12 },
    content: { color: c.textSecondary, fontSize: 15, lineHeight: 21 },
    deleted: { color: c.textMuted, fontStyle: 'italic', alignSelf: 'center' },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 2 },
    action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    actionText: { color: c.textMuted, fontSize: 13, fontWeight: '600' },
});
