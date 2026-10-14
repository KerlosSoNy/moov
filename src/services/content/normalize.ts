// Pure provider → ContentItem normalizers. Only type imports here, so the
// module also runs under `node --test` (see scripts/tests).
import type { ContentItem, ContentType } from "../../types/content";

type Raw = Record<string, unknown>;

const TMDB_POSTER = "https://image.tmdb.org/t/p/w342";
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿ]/;

const isObject = (value: unknown): value is Raw =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;

const year = (value: unknown): number | null =>
    typeof value === "number" && Number.isInteger(value) && value > 1870 && value < 2200 ? value : null;

// Providers use 0 for "not rated"
const rating = (...values: unknown[]): number | null => {
    for (const value of values) {
        if (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 10) {
            return Math.round(value * 10) / 10;
        }
    }
    return null;
};

const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && !!v.trim()) : [];

export const hasArabicScript = (value: string | null | undefined) => !!value && ARABIC_SCRIPT.test(value);

// ── Shoof Aflam ───────────────────────────────────────────────────────────
// titles.json rows: { slug, title_ar, title_en, year, type: "movie"|"series",
// rating, platforms[], genre, poster_path, vote_average? }. The docs list
// `genres` but the feed sends a single `genre`; both are accepted.

export function normalizeShoofTitle(raw: unknown): ContentItem | null {
    if (!isObject(raw)) return null;
    const slug = text(raw.slug);
    const type: ContentType | null = raw.type === "movie" || raw.type === "series" ? raw.type : null;
    if (!slug || !type) return null;

    const titleEn = text(raw.title_en);
    // Untranslated rows repeat the English title in title_ar
    const titleAr = hasArabicScript(text(raw.title_ar)) ? text(raw.title_ar) : null;
    if (!titleAr && !titleEn) return null;

    const posterPath = text(raw.poster_path);
    const genres = [...new Set([...strings(raw.genres), ...(text(raw.genre) ? [text(raw.genre)!] : [])])];

    return {
        provider: "shoofaflam",
        type,
        id: slug,
        key: `shoofaflam:${type}:${slug}`,
        slug,
        titleAr,
        titleEn,
        poster: posterPath?.startsWith("/") ? `${TMDB_POSTER}${posterPath}` : null,
        backdrop: null,
        year: year(raw.year),
        originalLanguage: null,
        country: null,
        genres,
        rating: rating(raw.rating, raw.vote_average),
        overview: null,
        platforms: strings(raw.platforms),
    };
}

// Drops malformed rows and duplicates (same key, or same type + English
// title + year listed under two slugs), keeping the first occurrence so the
// feed's own ordering is preserved
export function normalizeShoofCatalog(raw: unknown): ContentItem[] {
    if (!Array.isArray(raw)) throw new Error("Shoof Aflam catalog is not an array");
    const seen = new Set<string>();
    const items: ContentItem[] = [];
    for (const row of raw) {
        const item = normalizeShoofTitle(row);
        if (!item) continue;
        const twin = `${item.type}|${(item.titleEn ?? item.titleAr ?? "").toLowerCase()}|${item.year}`;
        if (seen.has(item.key) || seen.has(twin)) continue;
        seen.add(item.key);
        seen.add(twin);
        items.push(item);
    }
    return items;
}

// ── Trakt ─────────────────────────────────────────────────────────────────

const traktImage = (value: unknown): string | null => {
    const path = strings(value)[0];
    if (!path) return null;
    return path.startsWith("http") ? path : `https://${path}`;
};

export function normalizeTraktTitle(raw: unknown, type: ContentType): ContentItem | null {
    if (!isObject(raw) || !isObject(raw.ids)) return null;
    const traktId = raw.ids.trakt;
    if (typeof traktId !== "number") return null;
    const id = String(traktId);
    const title = text(raw.title);
    const images = isObject(raw.images) ? raw.images : {};
    const language = text(raw.language);

    return {
        provider: "trakt",
        type,
        id,
        key: `trakt:${type}:${id}`,
        slug: text(raw.ids.slug),
        // Trakt titles are English unless the original is Arabic
        titleEn: title,
        titleAr: hasArabicScript(title) ? title : null,
        poster: traktImage(images.poster),
        backdrop: traktImage(images.fanart),
        year: year(raw.year),
        originalLanguage: language,
        country: text(raw.country),
        genres: strings(raw.genres),
        rating: rating(raw.rating),
        overview: text(raw.overview),
        platforms: [],
    };
}

export function dedupe(items: ContentItem[]): ContentItem[] {
    const seen = new Set<string>();
    return items.filter((item) => !seen.has(item.key) && !!seen.add(item.key));
}

// ── Local search over the Shoof Aflam catalog ───────────────────────────────

// Folds Arabic letter variants and diacritics so "احمد" finds "أحمد"
export function normalizeSearchText(value: string): string {
    return value
        .toLowerCase()
        .replace(/[ً-ٰٟـ]/g, "")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

export type LocalSort = "featured" | "newest" | "rating" | "title";

export type LocalQuery = {
    // null: movies and series together
    type: ContentType | null;
    query?: string;
    genre?: string | null;
    sort?: LocalSort;
    // Keep only rows with an Arabic title (the Arabic categories)
    arabicOnly?: boolean;
};

export function filterCatalog(catalog: ContentItem[], q: LocalQuery): ContentItem[] {
    const needle = q.query ? normalizeSearchText(q.query) : "";
    const result = catalog.filter(
        (item) =>
            (!q.type || item.type === q.type) &&
            (!q.arabicOnly || !!item.titleAr) &&
            (!q.genre || item.genres.includes(q.genre)) &&
            (!needle ||
                normalizeSearchText(`${item.titleAr ?? ""} ${item.titleEn ?? ""}`).includes(needle)),
    );
    switch (q.sort ?? "featured") {
        case "newest":
            return result.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (b.rating ?? 0) - (a.rating ?? 0));
        case "rating":
            return result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        case "title":
            return result.sort((a, b) => (a.titleEn ?? a.titleAr ?? "").localeCompare(b.titleEn ?? b.titleAr ?? ""));
        default:
            // Feed order: Shoof Aflam lists current and curated titles first
            return result;
    }
}

export function catalogGenres(catalog: ContentItem[], type: ContentType | null): string[] {
    const counts = new Map<string, number>();
    for (const item of catalog) {
        if (type && item.type !== type) continue;
        for (const genre of item.genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([genre]) => genre);
}

// Normalized [Arabic, English] titles, computed once per item
const searchKeys = new WeakMap<ContentItem, [string, string]>();
const keysOf = (item: ContentItem) => {
    let keys = searchKeys.get(item);
    if (!keys) {
        keys = [normalizeSearchText(item.titleAr ?? ""), normalizeSearchText(item.titleEn ?? "")];
        searchKeys.set(item, keys);
    }
    return keys;
};

// 0 exact · 1 starts with · 2 a word starts with · 3 contains · null no match
function matchScore(haystack: string, needle: string): number | null {
    if (!haystack) return null;
    if (haystack === needle) return 0;
    if (haystack.startsWith(needle)) return 1;
    if (` ${haystack}`.includes(` ${needle}`)) return 2;
    return haystack.includes(needle) ? 3 : null;
}

// Ranked search over both titles, for the Search tab. With an empty query
// it lists the genre (if any) by rating.
export function searchCatalog(
    catalog: ContentItem[],
    query: string,
    { genre = null, limit = 30 }: { genre?: string | null; limit?: number } = {},
): ContentItem[] {
    const needle = normalizeSearchText(query);
    if (!needle && !genre) return [];
    const scored: { item: ContentItem; score: number }[] = [];
    for (const item of catalog) {
        if (genre && !item.genres.includes(genre)) continue;
        let score = 4;
        if (needle) {
            const [ar, en] = keysOf(item);
            const best = Math.min(matchScore(ar, needle) ?? 9, matchScore(en, needle) ?? 9);
            if (best === 9) continue;
            score = best;
        }
        scored.push({ item, score });
    }
    return scored
        .sort(
            (a, b) =>
                a.score - b.score ||
                Number(!!b.item.poster) - Number(!!a.item.poster) ||
                (b.item.rating ?? 0) - (a.item.rating ?? 0) ||
                (b.item.year ?? 0) - (a.item.year ?? 0),
        )
        .slice(0, limit)
        .map(({ item }) => item);
}

// Same title listed by two providers (they share no ids)
export const twinKey = (item: ContentItem) =>
    `${item.type}|${normalizeSearchText(item.titleEn ?? item.titleAr ?? "")}|${item.year ?? ""}`;
