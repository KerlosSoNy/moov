// Browsable categories and the source behind each one. Arabic categories are
// served from the Shoof Aflam catalog (filtered locally); international ones
// page through Trakt, excluding Arabic-language titles the Arabic rows cover.
import type { TranslationKey } from "@/i18n/config";
import type { ContentItem, ContentType } from "@/types/content";
import { catalogGenres, dedupe, filterCatalog, type LocalSort } from "./normalize";
import { loadShoofCatalog } from "./shoofAflam";
import { fetchTraktGenres, fetchTraktList, searchTrakt, type TraktList } from "./trakt";

export type CategoryId = "arabic-movies" | "international-movies" | "arabic-series" | "international-series" | "new-arabic";

export type BrowseSort = LocalSort | TraktList;

type Category =
    | { source: "shoofaflam"; type: ContentType | null; title: TranslationKey; sorts: BrowseSort[] }
    | { source: "trakt"; type: ContentType; title: TranslationKey; sorts: BrowseSort[] };

export const CATEGORIES: Record<CategoryId, Category> = {
    "arabic-movies": {
        type: "movie",
        source: "shoofaflam",
        title: "arabicMovies",
        sorts: ["featured", "newest", "rating", "title"],
    },
    "international-movies": {
        type: "movie",
        source: "trakt",
        title: "internationalMovies",
        sorts: ["popular", "trending"],
    },
    "arabic-series": {
        type: "series",
        source: "shoofaflam",
        title: "arabicSeries",
        sorts: ["featured", "newest", "rating", "title"],
    },
    "international-series": {
        type: "series",
        source: "trakt",
        title: "internationalSeries",
        sorts: ["popular", "trending"],
    },
    // Movies and series together. Shoof Aflam has no "date added", so release
    // year (then rating) stands in for recency
    "new-arabic": {
        type: null,
        source: "shoofaflam",
        title: "newArabicReleases",
        sorts: ["newest", "rating"],
    },
};

export const isCategoryId = (value: unknown): value is CategoryId =>
    typeof value === "string" && value in CATEGORIES;

export type BrowseParams = {
    query?: string;
    genre?: string | null;
    sort?: BrowseSort;
    page?: number;
    limit?: number;
};

export type BrowsePage = { items: ContentItem[]; hasMore: boolean };

const notArabic = (item: ContentItem) => item.originalLanguage !== "ar";

export async function browseCategory(
    id: CategoryId,
    { query = "", genre = null, sort, page = 1, limit = 24 }: BrowseParams,
    signal?: AbortSignal,
): Promise<BrowsePage> {
    const category = CATEGORIES[id];
    const trimmed = query.trim();

    if (category.source === "shoofaflam") {
        const catalog = await loadShoofCatalog();
        const all = filterCatalog(catalog, {
            type: category.type,
            query: trimmed,
            genre,
            sort: (sort as LocalSort | undefined) ?? (category.sorts[0] as LocalSort),
            arabicOnly: true,
        });
        const start = (page - 1) * limit;
        return { items: all.slice(start, start + limit), hasMore: start + limit < all.length };
    }

    const result = trimmed
        ? await searchTrakt(category.type, trimmed, { page, limit, genre }, signal)
        : await fetchTraktList(category.type, (sort as TraktList | undefined) ?? "popular", { page, limit, genre }, signal);
    return { items: result.items.filter(notArabic), hasMore: result.hasMore };
}

export async function categoryGenres(id: CategoryId): Promise<string[]> {
    const category = CATEGORIES[id];
    if (category.source === "trakt") return fetchTraktGenres(category.type);
    const catalog = await loadShoofCatalog();
    return catalogGenres(catalog.filter((item) => !!item.titleAr), category.type);
}

// ── Home rows ──────────────────────────────────────────────────────────────

const ROW_SIZE = 15;

// Home rows skip poster-less titles; the full category screens keep them
const withPoster = (items: ContentItem[]) => items.filter((item) => !!item.poster);

export async function fetchHomeRow(id: CategoryId, signal?: AbortSignal): Promise<ContentItem[]> {
    const { items } = await browseCategory(id, { limit: ROW_SIZE * 2 }, signal);
    return dedupe(withPoster(items)).slice(0, ROW_SIZE);
}
