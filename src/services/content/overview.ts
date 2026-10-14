// Arabic + English descriptions for any title.
//  - Trakt titles: English from Trakt, Arabic from /translations/ar (no extra key).
//  - Shoof Aflam titles: its API has no descriptions, so they come from TMDB
//    (where Shoof Aflam's own data and posters come from). Needs
//    EXPO_PUBLIC_TMDB_API_KEY; without it Shoof titles have no description.
import { apiRequest } from "@/lib/fetchInstance";
import type { ContentItem } from "@/types/content";
import Storage from "expo-sqlite/kv-store";

export type Overview = { ar: string | null; en: string | null };

const TMDB_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;
const TMDB_URL = "https://api.themoviedb.org/3";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Arabic locales in order of preference when several exist
const AR_COUNTRIES = ["EG", "SA", "AE"];

export const tmdbConfigured = !!TMDB_KEY;

const clean = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;

// ── Trakt ───────────────────────────────────────────────────────────────────

type Translation = { overview?: unknown; language?: string; country?: string | null };

async function traktOverview(item: Pick<ContentItem, "type" | "id" | "overview">, signal?: AbortSignal): Promise<Overview> {
    const path = item.type === "movie" ? "movies" : "shows";
    const rows = await apiRequest<Translation[]>(`/${path}/${encodeURIComponent(item.id)}/translations/ar`, { signal }).catch(
        () => [] as Translation[],
    );
    const ranked = (Array.isArray(rows) ? rows : [])
        .filter((row) => clean(row.overview))
        .sort((a, b) => rank(a.country) - rank(b.country));
    return { en: clean(item.overview), ar: clean(ranked[0]?.overview) };
}

const rank = (country?: string | null) => {
    const i = AR_COUNTRIES.indexOf((country ?? "").toUpperCase());
    return i === -1 ? AR_COUNTRIES.length : i;
};

// ── TMDB ────────────────────────────────────────────────────────────────────

async function tmdb<T>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
    // A v4 read access token is a JWT; a v3 API key is a short hex string
    const bearer = TMDB_KEY!.startsWith("eyJ");
    const query = Object.entries({ ...params, ...(bearer ? {} : { api_key: TMDB_KEY }) })
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join("&");
    const response = await fetch(`${TMDB_URL}${path}?${query}`, {
        headers: { Accept: "application/json", ...(bearer ? { Authorization: `Bearer ${TMDB_KEY}` } : {}) },
        signal,
    });
    if (!response.ok) throw new Error(`TMDB ${path}: HTTP ${response.status}`);
    return response.json() as Promise<T>;
}

type TmdbResult = { id: number; poster_path?: string | null; release_date?: string; first_air_date?: string };

const posterPath = (url: string | null) => url?.match(/image\.tmdb\.org\/t\/p\/\w+(\/[^/?#]+)$/)?.[1] ?? null;
const resultYear = (r: TmdbResult) => Number((r.release_date ?? r.first_air_date ?? "").slice(0, 4)) || null;

// Shoof Aflam rows don't carry TMDB ids, so search by title and confirm the
// match by poster path (Shoof posters are TMDB images), then by year
async function findTmdbId(item: ContentItem, signal?: AbortSignal): Promise<number | null> {
    const kind = item.type === "movie" ? "movie" : "tv";
    const poster = posterPath(item.poster);
    const queries = [item.titleEn, item.titleAr].filter((q): q is string => !!q);
    for (const query of [...new Set(queries)]) {
        for (const year of item.year ? [item.year, undefined] : [undefined]) {
            const { results = [] } = await tmdb<{ results?: TmdbResult[] }>(
                `/search/${kind}`,
                { query, [kind === "movie" ? "year" : "first_air_date_year"]: year, include_adult: "false" },
                signal,
            );
            const byPoster = poster ? results.find((r) => r.poster_path === poster) : undefined;
            if (byPoster) return byPoster.id;
            const byYear = item.year ? results.find((r) => resultYear(r) === item.year) : undefined;
            if (byYear) return byYear.id;
        }
    }
    return null;
}

type TmdbDetails = {
    overview?: string;
    translations?: { translations?: { iso_639_1: string; iso_3166_1: string; data?: { overview?: string } }[] };
};

async function tmdbOverview(item: ContentItem, signal?: AbortSignal): Promise<Overview> {
    const id = await findTmdbId(item, signal);
    if (!id) return { ar: null, en: null };
    const details = await tmdb<TmdbDetails>(
        `/${item.type === "movie" ? "movie" : "tv"}/${id}`,
        { language: "en-US", append_to_response: "translations" },
        signal,
    );
    const translations = details.translations?.translations ?? [];
    const pick = (lang: string, countries: string[]) =>
        translations
            .filter((tr) => tr.iso_639_1 === lang && clean(tr.data?.overview))
            .sort((a, b) => {
                const ia = countries.indexOf(a.iso_3166_1);
                const ib = countries.indexOf(b.iso_3166_1);
                return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
            })[0]?.data?.overview;
    return {
        en: clean(pick("en", ["US", "GB"])) ?? clean(details.overview),
        ar: clean(pick("ar", AR_COUNTRIES)),
    };
}

// ── Public API ─────────────────────────────────────────────────────────────

const memory = new Map<string, Overview>();

export async function fetchOverview(item: ContentItem, signal?: AbortSignal): Promise<Overview> {
    const cacheKey = `overview:${item.key}`;
    const hit = memory.get(cacheKey);
    if (hit) return hit;
    try {
        const raw = await Storage.getItem(cacheKey);
        const cached = raw ? (JSON.parse(raw) as { at: number; value: Overview }) : null;
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
            memory.set(cacheKey, cached.value);
            return cached.value;
        }
    } catch {
        // Unreadable cache: fetch again
    }

    let value: Overview;
    if (item.provider === "trakt") value = await traktOverview(item, signal);
    else if (TMDB_KEY) value = await tmdbOverview(item, signal);
    else return { ar: null, en: null };

    memory.set(cacheKey, value);
    Storage.setItem(cacheKey, JSON.stringify({ at: Date.now(), value })).catch(() => {});
    return value;
}
