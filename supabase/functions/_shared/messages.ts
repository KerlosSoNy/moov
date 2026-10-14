// Pure message building for notifications (no Deno or network APIs, so it is
// unit tested under Node: scripts/tests/messages.test.mts).

export type LocalizedMessage = { title_ar: string; body_ar: string; title_en: string; body_en: string };
export type PreparedMessage = LocalizedMessage & { data: { url: string } & Record<string, unknown> };

export type Campaign = LocalizedMessage & {
    id: string;
    use_template_rotation: boolean;
    recommendation_source: "none" | "fixed" | "catalog";
    content_provider: string | null;
    content_type: string | null;
    content_id: string | null;
    content_title_ar: string | null;
    content_title_en: string | null;
};

export type Recommendation = {
    provider: string;
    type: string;
    id: string;
    titleAr: string | null;
    titleEn: string | null;
};

// Expo's payload limit is 4 KB; these keep well inside it and inside the UI
const TITLE_MAX = 100;
const BODY_MAX = 240;
const PLACEHOLDER = "{title}";

// Same paths as the app's contentHref() and SQL public.content_url()
export function contentUrl(ref: { provider: string; type: string; id: string }): string {
    return ref.provider === "trakt" && ref.type === "movie"
        ? `/movie/${encodeURIComponent(ref.id)}`
        : `/content/${ref.provider}/${ref.type}/${encodeURIComponent(ref.id)}`;
}

// Stable small integer from a string, so retries on the same day pick the same
// template and recommendation
export function stableHash(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

const usesPlaceholder = (m: LocalizedMessage) =>
    [m.title_ar, m.body_ar, m.title_en, m.body_en].some((text) => text.includes(PLACEHOLDER));

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function buildCampaignMessage(
    campaign: Campaign,
    templates: LocalizedMessage[],
    recommendation: Recommendation | null,
    scheduledDate: string,
): PreparedMessage {
    let message: LocalizedMessage = campaign;
    if (campaign.use_template_rotation) {
        // Templates naming a title only make sense when there is one
        const usable = templates.filter((t) => recommendation || !usesPlaceholder(t));
        if (usable.length) message = usable[stableHash(`${campaign.id}:${scheduledDate}`) % usable.length];
    }
    if (!recommendation && usesPlaceholder(message)) {
        message = DEFAULT_DISCOVERY;
    }

    const titleAr = recommendation?.titleAr ?? recommendation?.titleEn ?? "";
    const titleEn = recommendation?.titleEn ?? recommendation?.titleAr ?? "";
    const fill = (text: string, title: string) => text.split(PLACEHOLDER).join(title);

    return {
        title_ar: clip(fill(message.title_ar, titleAr), TITLE_MAX),
        body_ar: clip(fill(message.body_ar, titleAr), BODY_MAX),
        title_en: clip(fill(message.title_en, titleEn), TITLE_MAX),
        body_en: clip(fill(message.body_en, titleEn), BODY_MAX),
        data: { url: recommendation ? contentUrl(recommendation) : "/home" },
    };
}

export function fixedRecommendation(campaign: Campaign): Recommendation | null {
    if (!campaign.content_provider || !campaign.content_type || !campaign.content_id) return null;
    return {
        provider: campaign.content_provider,
        type: campaign.content_type,
        id: campaign.content_id,
        titleAr: campaign.content_title_ar,
        titleEn: campaign.content_title_en,
    };
}

// Picks a well-rated, recent Arabic title with a poster from the Shoof Aflam
// feed (raw titles.json rows). Deterministic per campaign and day.
export function pickCatalogRecommendation(rows: unknown, seed: string, today = new Date()): Recommendation | null {
    if (!Array.isArray(rows)) return null;
    const minYear = today.getUTCFullYear() - 3;
    const candidates = rows.filter(
        (row): row is Record<string, unknown> =>
            typeof row === "object" && row !== null &&
            typeof row.slug === "string" &&
            (row.type === "movie" || row.type === "series") &&
            typeof row.title_ar === "string" && /[؀-ۿ]/.test(row.title_ar) &&
            typeof row.poster_path === "string" &&
            typeof row.rating === "number" && row.rating >= 7 &&
            typeof row.year === "number" && row.year >= minYear,
    );
    if (!candidates.length) return null;
    const row = candidates[stableHash(seed) % candidates.length];
    return {
        provider: "shoofaflam",
        type: row.type as string,
        id: row.slug as string,
        titleAr: row.title_ar as string,
        titleEn: typeof row.title_en === "string" ? row.title_en : null,
    };
}

export const DEFAULT_DISCOVERY: LocalizedMessage = {
    title_en: "🎬 Moov",
    body_en: "Discover your next favorite movie on Moov!",
    title_ar: "🎬 Moov",
    body_ar: "اكتشف فيلمك الجديد النهارده على Moov!",
};

// Event notifications. {name} is filled in SQL (notif_expand_events).
export const EVENT_MESSAGES: Record<"comment_reply" | "moderation", LocalizedMessage> = {
    comment_reply: {
        title_en: "💬 New reply",
        body_en: "{name} replied to your comment",
        title_ar: "💬 رد جديد",
        body_ar: "{name} رد على تعليقك",
    },
    moderation: {
        title_en: "Comment removed",
        body_en: "One of your comments was removed for breaking the community guidelines.",
        title_ar: "تم حذف تعليق",
        body_ar: "تم حذف أحد تعليقاتك لمخالفته إرشادات المجتمع.",
    },
};
