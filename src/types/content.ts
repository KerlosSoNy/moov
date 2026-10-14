// Provider-neutral catalog model. UI components take ContentItem, never a
// provider's raw payload, so a new source only needs a normalizer.

export type ContentProvider = "trakt" | "shoofaflam";
export type ContentType = "movie" | "series";

// Identifies a title in Supabase tables (comments, ratings): the same triple
// is stored as content_provider / content_type / content_id
export type ContentRef = {
    provider: ContentProvider;
    type: ContentType;
    // Provider's own id: Trakt numeric id as text, Shoof Aflam slug
    id: string;
};

export type ContentItem = ContentRef & {
    // `${provider}:${type}:${id}`, unique across providers
    key: string;
    // Slug for providers whose detail endpoints are slug based (Trakt)
    slug: string | null;
    titleAr: string | null;
    titleEn: string | null;
    poster: string | null;
    backdrop: string | null;
    year: number | null;
    // ISO 639-1 / 3166-1 codes when the provider reports them
    originalLanguage: string | null;
    country: string | null;
    genres: string[];
    // Third-party rating on a 0–10 scale; null when unknown
    rating: number | null;
    overview: string | null;
    // Streaming platform ids (Shoof Aflam only)
    platforms: string[];
};

export const contentKey = (ref: ContentRef) => `${ref.provider}:${ref.type}:${ref.id}`;

// Title in the reader's language, falling back to whichever one exists
export function displayTitle(item: Pick<ContentItem, "titleAr" | "titleEn">, language: string): string {
    const preferred = language === "ar" ? item.titleAr : item.titleEn;
    return preferred || item.titleEn || item.titleAr || "";
}

// The other-language title, shown as a subtitle when it differs
export function secondaryTitle(item: Pick<ContentItem, "titleAr" | "titleEn">, language: string): string | null {
    const primary = displayTitle(item, language);
    const other = language === "ar" ? item.titleEn : item.titleAr;
    return other && other !== primary ? other : null;
}
