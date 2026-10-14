import type { ContentItem, ContentRef } from "@/types/content";
import type { Movie } from "@/types/movie";
import type { Href } from "expo-router";

// Trakt movies keep their richer existing screen; every other title opens the
// generic content screen. Push notification deep links use the same paths.
export function contentHref(ref: ContentRef & { slug?: string | null }): Href {
    if (ref.provider === "trakt" && ref.type === "movie" && ref.slug) {
        return { pathname: "/movie/[slug]", params: { slug: ref.slug } };
    }
    return {
        pathname: "/content/[provider]/[type]/[id]",
        params: { provider: ref.provider, type: ref.type, id: ref.provider === "trakt" ? (ref.slug ?? ref.id) : ref.id },
    };
}

// Favorites are stored as Trakt movie snapshots, so only Trakt movies can be saved
export function toFavoriteMovie(item: ContentItem): Movie | null {
    if (item.provider !== "trakt" || item.type !== "movie" || !item.slug) return null;
    return {
        id: item.id,
        ids: { trakt: Number(item.id), slug: item.slug },
        title: item.titleEn ?? item.titleAr ?? "",
        year: item.year ?? 0,
        genres: item.genres,
        images: { poster: item.poster ? [item.poster] : [], fanart: item.backdrop ? [item.backdrop] : [] },
        rating: item.rating ?? 0,
        poster: item.poster ?? "",
        overview: item.overview ?? undefined,
    };
}

// Same destination as contentHref, as a path string (for notification data)
export function contentPath(ref: ContentRef & { slug?: string | null }): string {
    if (ref.provider === "trakt" && ref.type === "movie" && ref.slug) {
        return `/movie/${encodeURIComponent(ref.slug)}`;
    }
    const id = ref.provider === "trakt" ? (ref.slug ?? ref.id) : ref.id;
    return `/content/${ref.provider}/${ref.type}/${encodeURIComponent(id)}`;
}
