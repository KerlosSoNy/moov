import type { TranslationKey } from "@/i18n/config";
import { supabase } from "@/lib/supabase";
import type { ContentRef } from "@/types/content";

export const COMMENT_MAX_LENGTH = 2000;
export const REPORT_DESCRIPTION_MAX = 500;
export const REPORT_REASONS = ["spam", "harassment", "offensive", "spoilers", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type Comment = {
    id: string;
    parentId: string | null;
    authorName: string;
    authorAvatar: string | null;
    // null when deleted: the text is never sent to other users
    content: string | null;
    isDeleted: boolean;
    deletedByModerator: boolean;
    isMine: boolean;
    createdAt: string;
    editedAt: string | null;
    likeCount: number;
    likedByMe: boolean;
    replyCount: number;
};

export type CommentCursor = { createdAt: string; id: string };

type CommentRow = {
    id: string;
    parent_comment_id: string | null;
    author_name: string | null;
    author_avatar: string | null;
    content: string | null;
    is_deleted: boolean;
    deletion_reason: string | null;
    is_mine: boolean;
    created_at: string;
    edited_at: string | null;
    like_count: number;
    liked_by_me: boolean;
    reply_count: number;
};

const toComment = (row: CommentRow): Comment => ({
    id: row.id,
    parentId: row.parent_comment_id,
    authorName: row.author_name ?? "",
    authorAvatar: row.author_avatar,
    content: row.content,
    isDeleted: row.is_deleted,
    deletedByModerator: row.deletion_reason === "moderator",
    isMine: row.is_mine,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    likeCount: Number(row.like_count) || 0,
    likedByMe: row.liked_by_me,
    replyCount: Number(row.reply_count) || 0,
});

const refParams = (ref: ContentRef) => ({ p_provider: ref.provider, p_type: ref.type, p_content_id: ref.id });

// Top level: newest first. Replies (parentId set): oldest first.
export async function fetchComments(
    ref: ContentRef,
    { parentId = null, cursor = null, limit = 20 }: { parentId?: string | null; cursor?: CommentCursor | null; limit?: number } = {},
): Promise<{ comments: Comment[]; nextCursor: CommentCursor | null }> {
    const { data, error } = await supabase.rpc("get_comments", {
        ...refParams(ref),
        p_parent_id: parentId,
        p_cursor_created_at: cursor?.createdAt ?? null,
        p_cursor_id: cursor?.id ?? null,
        p_limit: limit,
    });
    if (error) throw error;
    const comments = (data as CommentRow[]).map(toComment);
    const last = comments.at(-1);
    return {
        comments,
        nextCursor: comments.length === limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
}

export async function fetchCommentCount(ref: ContentRef): Promise<number> {
    const { data, error } = await supabase.rpc("get_comment_count", refParams(ref));
    if (error) throw error;
    return Number(data) || 0;
}

// Returns the stored comment (trimmed text, server timestamps, reply parent
// normalized to the top-level comment)
export async function addComment(ref: ContentRef, content: string, parentId: string | null = null) {
    const { data, error } = await supabase
        .from("comments")
        .insert({
            content_provider: ref.provider,
            content_type: ref.type,
            content_id: ref.id,
            content: content.trim(),
            parent_comment_id: parentId,
        })
        .select("id, parent_comment_id, content, created_at")
        .single();
    if (error) throw error;
    return data as { id: string; parent_comment_id: string | null; content: string; created_at: string };
}

export async function editComment(id: string, content: string) {
    const { data, error } = await supabase
        .from("comments")
        .update({ content: content.trim() })
        .eq("id", id)
        .select("content, edited_at")
        .maybeSingle();
    if (error) throw error;
    // RLS filtered the row out: it was deleted (or never ours)
    if (!data) throw new CommunityError("comment_unavailable");
    return data as { content: string; edited_at: string };
}

export async function deleteComment(id: string) {
    const { error } = await supabase.rpc("delete_comment", { p_comment_id: id });
    if (error) throw error;
}

// Idempotent: liking twice or unliking twice is a no-op, so retries and fast
// double taps can't skew the count
export async function setCommentLike(id: string, liked: boolean) {
    const { error } = liked
        ? await supabase
              .from("comment_likes")
              .upsert({ comment_id: id }, { onConflict: "comment_id,user_id", ignoreDuplicates: true })
        : await supabase.from("comment_likes").delete().eq("comment_id", id);
    if (error) throw error;
}

export async function reportComment(id: string, reason: ReportReason, description?: string) {
    const { error } = await supabase.rpc("report_comment", {
        p_comment_id: id,
        p_reason: reason,
        p_description: description?.trim() || null,
    });
    if (error) throw error;
}

export class CommunityError extends Error {}

// Maps database errors (see the migrations' `raise exception` names) to messages
export function communityErrorKey(error: unknown): TranslationKey {
    const message = error instanceof Error || (typeof error === "object" && error && "message" in error)
        ? String((error as { message: unknown }).message)
        : "";
    if (message.includes("comment_unavailable")) return "commentUnavailable";
    if (message.includes("rate_limited")) return "commentRateLimited";
    if (message.includes("already_reported")) return "alreadyReported";
    if (message.includes("own_comment")) return "cannotReportOwn";
    if (message.includes("content_check")) return "commentInvalid";
    return "communityError";
}
