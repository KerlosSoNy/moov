// International movies and series from Trakt, normalized to ContentItem.
// Trakt paginates with ?page=&limit= and filters with ?genres=.
import { apiRequest } from "@/lib/fetchInstance";
import type { ContentItem, ContentType } from "@/types/content";
import { normalizeTraktTitle } from "./normalize";

const EXT = "extended=full,images";

export type TraktList = "popular" | "trending";

// Trakt names series "shows"; trending/search wrap each item as { movie } / { show }
const path = (type: ContentType) => (type === "movie" ? "movies" : "shows");
const wrapperKey = (type: ContentType) => (type === "movie" ? "movie" : "show");

function normalizeList(raw: unknown, type: ContentType, wrapped: boolean): ContentItem[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((row) => normalizeTraktTitle(wrapped ? row?.[wrapperKey(type)] : row, type))
        .filter((item): item is ContentItem => !!item);
}

type Page = { items: ContentItem[]; hasMore: boolean };

export async function fetchTraktList(
    type: ContentType,
    list: TraktList,
    { page = 1, limit = 20, genre }: { page?: number; limit?: number; genre?: string | null } = {},
    signal?: AbortSignal,
): Promise<Page> {
    const genres = genre ? `&genres=${encodeURIComponent(genre)}` : "";
    const raw = await apiRequest<unknown>(
        `/${path(type)}/${list}?${EXT}&page=${page}&limit=${limit}${genres}`,
        { signal },
    );
    const rows = Array.isArray(raw) ? raw.length : 0;
    return { items: normalizeList(raw, type, list === "trending"), hasMore: rows >= limit };
}

export async function searchTrakt(
    type: ContentType,
    query: string,
    { page = 1, limit = 20, genre }: { page?: number; limit?: number; genre?: string | null } = {},
    signal?: AbortSignal,
): Promise<Page> {
    const genres = genre ? `&genres=${encodeURIComponent(genre)}` : "";
    const raw = await apiRequest<unknown>(
        `/search/${wrapperKey(type)}?query=${encodeURIComponent(query)}&${EXT}&page=${page}&limit=${limit}${genres}`,
        { signal },
    );
    const rows = Array.isArray(raw) ? raw.length : 0;
    return { items: normalizeList(raw, type, true), hasMore: rows >= limit };
}

export async function fetchTraktTitle(type: ContentType, slugOrId: string, signal?: AbortSignal) {
    const raw = await apiRequest<unknown>(`/${path(type)}/${encodeURIComponent(slugOrId)}?${EXT}`, { signal });
    const item = normalizeTraktTitle(raw, type);
    if (!item) throw new Error("Malformed Trakt response");
    return item;
}

const genreCache = new Map<ContentType, Promise<string[]>>();

export function fetchTraktGenres(type: ContentType): Promise<string[]> {
    let promise = genreCache.get(type);
    if (!promise) {
        promise = apiRequest<{ slug?: unknown }[]>(`/genres/${path(type)}`)
            .then((rows) => (Array.isArray(rows) ? rows.map((r) => r.slug).filter((s): s is string => typeof s === "string") : []))
            .catch((error) => {
                genreCache.delete(type);
                throw error;
            });
        genreCache.set(type, promise);
    }
    return promise;
}

// Movies and series in one request; rows come back as { type, movie | show }
export async function searchTraktAll(
    query: string,
    { limit = 20, genre }: { limit?: number; genre?: string | null } = {},
    signal?: AbortSignal,
): Promise<ContentItem[]> {
    const genres = genre ? `&genres=${encodeURIComponent(genre)}` : "";
    const raw = await apiRequest<unknown>(
        `/search/movie,show?query=${encodeURIComponent(query)}&${EXT}&limit=${limit}${genres}`,
        { signal },
    );
    if (!Array.isArray(raw)) return [];
    return raw
        .map((row) =>
            row?.type === "movie"
                ? normalizeTraktTitle(row.movie, "movie")
                : row?.type === "show"
                  ? normalizeTraktTitle(row.show, "series")
                  : null,
        )
        .filter((item): item is ContentItem => !!item);
}
