// Shoof Aflam (https://shoofaflam.tv/api-docs/) publishes static JSON that is
// rebuilt daily: no detail, search or pagination endpoints, so the whole
// catalog (~15k titles, ~3.6 MB) is downloaded once, cached on device and
// queried locally. Attribution to shoofaflam.tv is required by its terms.
import type { ContentItem } from "@/types/content";
import Storage from "expo-sqlite/kv-store";
import { normalizeShoofCatalog } from "./normalize";

const BASE_URL = "https://shoofaflam.tv/api";
const TTL_MS = 12 * 60 * 60 * 1000;

type Cached = { savedAt: number; etag: string | null; body: string };

export type Platform = {
    id: string;
    nameAr: string;
    nameEn: string;
    color: string | null;
    // Short brand mark from the feed, e.g. "N" (Netflix), "MBC" (Shahid)
    logoText: string | null;
    url: string | null;
};

async function readCache(key: string): Promise<Cached | null> {
    try {
        const raw = await Storage.getItem(key);
        if (!raw) return null;
        const cached = JSON.parse(raw) as Partial<Cached>;
        return typeof cached.body === "string" && typeof cached.savedAt === "number"
            ? { savedAt: cached.savedAt, etag: cached.etag ?? null, body: cached.body }
            : null;
    } catch {
        return null;
    }
}

function writeCache(key: string, value: Cached) {
    Storage.setItem(key, JSON.stringify(value)).catch((e) =>
        console.warn("Failed to cache Shoof Aflam data", e),
    );
}

// Fresh cache → no request. Stale cache → conditional request, and the stale
// copy is still served if the network fails
async function fetchCachedJson<T>(path: string, parse: (json: unknown) => T): Promise<T> {
    const cacheKey = `shoofaflam:${path}`;
    const cached = await readCache(cacheKey);
    if (cached && Date.now() - cached.savedAt < TTL_MS) return parse(JSON.parse(cached.body));

    try {
        const response = await fetch(`${BASE_URL}/${path}`, {
            headers: cached?.etag ? { "If-None-Match": cached.etag } : {},
        });
        if (response.status === 304 && cached) {
            writeCache(cacheKey, { ...cached, savedAt: Date.now() });
            return parse(JSON.parse(cached.body));
        }
        if (!response.ok) throw new Error(`Shoof Aflam ${path}: HTTP ${response.status}`);
        const body = await response.text();
        // Parse before caching so a malformed response never replaces a good copy
        const result = parse(JSON.parse(body));
        writeCache(cacheKey, { savedAt: Date.now(), etag: response.headers.get("etag"), body });
        return result;
    } catch (error) {
        if (cached) {
            console.warn("Using stale Shoof Aflam cache", error);
            return parse(JSON.parse(cached.body));
        }
        throw error;
    }
}

// One shared request per app session; a failure is not memoized so the next
// caller retries
let catalogPromise: Promise<ContentItem[]> | null = null;

export function loadShoofCatalog(): Promise<ContentItem[]> {
    catalogPromise ??= fetchCachedJson("titles.json", normalizeShoofCatalog).catch((error) => {
        catalogPromise = null;
        throw error;
    });
    return catalogPromise;
}

export async function findShoofTitle(type: string, slug: string): Promise<ContentItem | null> {
    const catalog = await loadShoofCatalog();
    return catalog.find((item) => item.type === type && item.id === slug) ?? null;
}

let platformsPromise: Promise<Map<string, Platform>> | null = null;

const parsePlatforms = (json: unknown) => {
    const map = new Map<string, Platform>();
    if (!Array.isArray(json)) return map;
    for (const row of json) {
        if (typeof row !== "object" || !row || typeof row.id !== "string") continue;
        map.set(row.id, {
            id: row.id,
            nameAr: typeof row.name_ar === "string" ? row.name_ar : row.id,
            nameEn: typeof row.name_en === "string" ? row.name_en : row.id,
            color: typeof row.color === "string" && /^#[0-9a-f]{3,8}$/i.test(row.color) ? row.color : null,
            logoText: typeof row.logo_text === "string" && row.logo_text.trim() ? row.logo_text.trim().slice(0, 4) : null,
            url: typeof row.url === "string" && row.url.startsWith("https://") ? row.url : null,
        });
    }
    return map;
};

export function loadShoofPlatforms(): Promise<Map<string, Platform>> {
    platformsPromise ??= fetchCachedJson("platforms.json", parsePlatforms).catch((error) => {
        platformsPromise = null;
        throw error;
    });
    return platformsPromise;
}
