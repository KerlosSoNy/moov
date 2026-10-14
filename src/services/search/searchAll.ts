// The Search tab queries both sources in parallel and returns them as
// sections: Arabic titles from the Shoof Aflam catalog (searched on device, in
// Arabic or English) and international titles from Trakt. Trakt's search
// doesn't handle Arabic text, so Arabic queries only search Shoof Aflam.
import { hasArabicScript, searchCatalog, twinKey } from "@/services/content/normalize";
import { loadShoofCatalog } from "@/services/content/shoofAflam";
import { fetchTraktList, searchTraktAll } from "@/services/content/trakt";
import type { ContentItem } from "@/types/content";

export type SearchSection = {
    id: "arabic" | "international";
    items: ContentItem[];
    // This source failed; the other one's results are still shown
    failed: boolean;
};

const LIMIT = 30;

export async function searchAll(query: string, signal: AbortSignal, genre?: string): Promise<SearchSection[]> {
    const arabicQuery = hasArabicScript(query);

    const shoof = loadShoofCatalog().then((catalog) => searchCatalog(catalog, query, { genre, limit: LIMIT }));
    const trakt: Promise<ContentItem[]> = arabicQuery
        ? Promise.resolve([])
        : query
          ? searchTraktAll(query, { limit: LIMIT, genre }, signal)
          : // Genre browsing (from a movie's genre chip)
            fetchTraktList("movie", "popular", { limit: LIMIT, genre }, signal).then((page) => page.items);

    const [arabic, international] = await Promise.allSettled([shoof, trakt]);
    if (arabic.status === "rejected" && international.status === "rejected") throw arabic.reason;

    const arabicItems = arabic.status === "fulfilled" ? arabic.value : [];
    // Drop international results that are the same title as an Arabic one
    const seen = new Set(arabicItems.map(twinKey));
    const internationalItems = international.status === "fulfilled"
        ? international.value.filter((item) => !seen.has(twinKey(item)))
        : [];

    const sections: SearchSection[] = [
        { id: "arabic", items: arabicItems, failed: arabic.status === "rejected" },
        { id: "international", items: internationalItems, failed: international.status === "rejected" },
    ];
    // Lead with the source the query is most likely aimed at
    return arabicQuery || !internationalItems.length ? sections : sections.reverse();
}
