import { browseCategory, type BrowseSort, type CategoryId } from "@/services/content/catalog";
import { dedupe } from "@/services/content/normalize";
import type { ContentItem } from "@/types/content";
import { useEffect, useRef, useState } from "react";

type Filters = { query: string; genre: string | null; sort: BrowseSort };

type Result = {
    key: string;
    items: ContentItem[];
    page: number;
    hasMore: boolean;
    // First page failed
    error: boolean;
    // State of the page after `page`
    more: "idle" | "loading" | "error";
};

const DEBOUNCE_MS = 350;
const EMPTY: ContentItem[] = [];

// Paged category listing. Changing a filter starts over from page 1; loading
// is derived from the request key, as in useSearch, and stale responses are
// dropped by key.
export function useBrowse(category: CategoryId, { query, genre, sort }: Filters) {
    const [debounced, setDebounced] = useState(query.trim());
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [query]);

    const [attempt, setAttempt] = useState(0);
    const key = `${category}|${debounced}|${genre ?? ""}|${sort}#${attempt}`;
    const [result, setResult] = useState<Result | null>(null);
    const moreController = useRef<AbortController | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        moreController.current?.abort();
        browseCategory(category, { query: debounced, genre, sort, page: 1 }, controller.signal)
            .then((page) => {
                if (controller.signal.aborted) return;
                setResult({ key, items: dedupe(page.items), page: 1, hasMore: page.hasMore, error: false, more: "idle" });
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                console.warn(error);
                setResult({ key, items: [], page: 0, hasMore: false, error: true, more: "idle" });
            });
        return () => controller.abort();
    }, [category, debounced, genre, sort, key]);

    const current = result?.key === key ? result : null;

    const loadMore = () => {
        if (!current || !current.hasMore || current.more === "loading") return;
        const controller = new AbortController();
        moreController.current = controller;
        const next = current.page + 1;
        setResult((r) => r && { ...r, more: "loading" });
        browseCategory(category, { query: debounced, genre, sort, page: next }, controller.signal)
            .then((page) => {
                if (controller.signal.aborted) return;
                setResult((r) =>
                    r?.key === key
                        ? { ...r, items: dedupe([...r.items, ...page.items]), page: next, hasMore: page.hasMore, more: "idle" }
                        : r,
                );
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                console.warn(error);
                setResult((r) => (r?.key === key ? { ...r, more: "error" } : r));
            });
    };

    const status = !current
        ? "loading"
        : current.error
          ? "error"
          : current.more === "loading"
            ? "loadingMore"
            : current.more === "error"
              ? "error"
              : "ready";

    return {
        items: current?.items ?? EMPTY,
        status,
        hasMore: !!current?.hasMore,
        // `loadMore` already ignores calls while a page is in flight
        loadMore: () => current?.more === "idle" && loadMore(),
        // Retries whichever page failed
        retry: () => (current?.more === "error" ? loadMore() : setAttempt((n) => n + 1)),
    } as const;
}
