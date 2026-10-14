import { useUser } from "@/providers/auth";
import { avatarUrl } from "@/services/profile/profile";
import {
    addComment,
    deleteComment,
    editComment,
    fetchComments,
    setCommentLike,
    type Comment,
    type CommentCursor,
} from "@/services/community/comments";
import type { ContentRef } from "@/types/content";
import { useEffect, useRef, useState } from "react";

type Status = "loading" | "loadingMore" | "error" | "ready";

type Page = {
    key: string;
    comments: Comment[];
    cursor: CommentCursor | null;
    // First page failed
    error: boolean;
    // State of the page after `cursor`
    more: "idle" | "loading" | "error";
};

const EMPTY: Comment[] = [];

// One page-able list: the top-level thread (parentId null) or one comment's
// replies. Mutations update the list in place; likes are optimistic. Loading
// is derived from the request key (as in useSearch).
export function useCommentThread(ref: ContentRef, parentId: string | null, { enabled = true } = {}) {
    const user = useUser();
    const [attempt, setAttempt] = useState(0);
    const key = `${ref.provider}:${ref.type}:${ref.id}:${parentId ?? ""}#${attempt}`;
    const [page, setPage] = useState<Page | null>(null);
    // Pending like requests per comment, chained so they reach the server in tap order
    const likeQueue = useRef(new Map<string, Promise<void>>());
    const loaded = page?.key === key;

    useEffect(() => {
        if (!enabled || loaded) return;
        let stale = false;
        fetchComments(ref, { parentId })
            .then((first) => !stale && setPage({ key, comments: first.comments, cursor: first.nextCursor, error: false, more: "idle" }))
            .catch((error) => {
                if (stale) return;
                console.warn(error);
                setPage({ key, comments: [], cursor: null, error: true, more: "idle" });
            });
        return () => {
            stale = true;
        };
        // key covers ref and parentId
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, enabled, loaded]);

    const current = loaded ? page : null;
    const comments = current?.comments ?? EMPTY;
    const status: Status = !current
        ? "loading"
        : current.error || current.more === "error"
          ? "error"
          : current.more === "loading"
            ? "loadingMore"
            : "ready";

    const setComments = (change: (list: Comment[]) => Comment[]) =>
        setPage((p) => (p?.key === key ? { ...p, comments: change(p.comments) } : p));

    const loadMore = () => {
        const cursor = current?.cursor;
        if (!cursor || current.more === "loading") return;
        setPage((p) => p && { ...p, more: "loading" });
        fetchComments(ref, { parentId, cursor })
            .then((next) =>
                setPage((p) => {
                    if (p?.key !== key) return p;
                    const seen = new Set(p.comments.map((c) => c.id));
                    return {
                        ...p,
                        comments: [...p.comments, ...next.comments.filter((c) => !seen.has(c.id))],
                        cursor: next.nextCursor,
                        more: "idle",
                    };
                }),
            )
            .catch((error) => {
                console.warn(error);
                setPage((p) => (p?.key === key ? { ...p, more: "error" } : p));
            });
    };

    const update = (id: string, patch: (c: Comment) => Partial<Comment>) =>
        setComments((list) => list.map((c) => (c.id === id ? { ...c, ...patch(c) } : c)));

    const add = async (content: string, replyTo: string | null = parentId) => {
        const saved = await addComment(ref, content, replyTo);
        const comment: Comment = {
            id: saved.id,
            parentId: saved.parent_comment_id,
            authorName: user.user_metadata?.name ?? "",
            authorAvatar: avatarUrl(user),
            content: saved.content,
            isDeleted: false,
            deletedByModerator: false,
            isMine: true,
            createdAt: saved.created_at,
            editedAt: null,
            likeCount: 0,
            likedByMe: false,
            replyCount: 0,
        };
        // Newest first at the top level, oldest first among replies
        setComments((list) => (parentId ? [...list, comment] : [comment, ...list]));
        return comment;
    };

    const edit = async (id: string, content: string) => {
        const saved = await editComment(id, content);
        update(id, () => ({ content: saved.content, editedAt: saved.edited_at }));
    };

    const remove = async (id: string) => {
        await deleteComment(id);
        // A top-level comment with replies stays as a placeholder, like the server returns it
        setComments((list) =>
            list.flatMap((c) =>
                c.id !== id ? [c] : !parentId && c.replyCount > 0 ? [{ ...c, isDeleted: true, content: null }] : [],
            ),
        );
    };

    const toggleLike = (comment: Comment) => {
        const liked = !comment.likedByMe;
        update(comment.id, (c) => ({ likedByMe: liked, likeCount: Math.max(0, c.likeCount + (liked ? 1 : -1)) }));
        const previous = likeQueue.current.get(comment.id) ?? Promise.resolve();
        const next = previous
            .then(() => setCommentLike(comment.id, liked))
            .catch((error) => {
                console.warn(error);
                // Roll back this tap only if no later tap superseded it
                if (likeQueue.current.get(comment.id) === next) {
                    update(comment.id, (c) => ({ likedByMe: !liked, likeCount: Math.max(0, c.likeCount + (liked ? -1 : 1)) }));
                }
            });
        likeQueue.current.set(comment.id, next);
    };

    // Keeps the parent's reply badge in sync when replies are added/removed elsewhere
    const adjustReplyCount = (id: string, delta: number) =>
        update(id, (c) => ({ replyCount: Math.max(0, c.replyCount + delta) }));

    return {
        comments,
        status,
        hasMore: !!current?.cursor,
        loadMore,
        // Retries whichever page failed
        reload: () => (current?.more === "error" ? loadMore() : setAttempt((n) => n + 1)),
        add,
        edit,
        remove,
        toggleLike,
        adjustReplyCount,
    };
}

export type CommentThread = ReturnType<typeof useCommentThread>;
