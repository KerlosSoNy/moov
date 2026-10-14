// Tests for the Edge Function's pure message logic (supabase/functions/_shared/messages.ts)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    buildCampaignMessage,
    contentUrl,
    DEFAULT_DISCOVERY,
    pickCatalogRecommendation,
    type Campaign,
} from "../../supabase/functions/_shared/messages.ts";

const campaign: Campaign = {
    id: "c1",
    title_ar: "عنوان",
    body_ar: "نص",
    title_en: "Title",
    body_en: "Body",
    use_template_rotation: false,
    recommendation_source: "none",
    content_provider: null,
    content_type: null,
    content_id: null,
    content_title_ar: null,
    content_title_en: null,
};

const templates = [
    { title_ar: "أ", body_ar: "اكتشف", title_en: "A", body_en: "Discover" },
    { title_ar: "ب", body_ar: "ترشيح الليلة: {title}", title_en: "B", body_en: "Tonight: {title}" },
];

const rec = { provider: "shoofaflam", type: "series", id: "el-king", titleAr: "الكينج", titleEn: "El King" };

test("uses the campaign text and opens Home without a recommendation", () => {
    const message = buildCampaignMessage(campaign, templates, null, "2026-10-14");
    assert.equal(message.title_en, "Title");
    assert.equal(message.body_ar, "نص");
    assert.deepEqual(message.data, { url: "/home" });
});

test("rotation is stable for a day and skips {title} templates without a recommendation", () => {
    const rotating = { ...campaign, use_template_rotation: true };
    const a = buildCampaignMessage(rotating, templates, null, "2026-10-14");
    assert.deepEqual(a, buildCampaignMessage(rotating, templates, null, "2026-10-14"));
    for (let day = 1; day <= 28; day++) {
        const message = buildCampaignMessage(rotating, templates, null, `2026-10-${String(day).padStart(2, "0")}`);
        assert.equal(message.body_en, "Discover");
    }
    const days = new Set(
        Array.from({ length: 28 }, (_, i) => buildCampaignMessage(rotating, templates, rec, `2026-10-${String(i + 1).padStart(2, "0")}`).body_en),
    );
    assert.deepEqual([...days].sort(), ["Discover", "Tonight: El King"]);
});

test("fills {title} per language and deep links to the title", () => {
    const message = buildCampaignMessage({ ...campaign, body_en: "Watch {title}", body_ar: "شاهد {title}" }, [], rec, "2026-10-14");
    assert.equal(message.body_en, "Watch El King");
    assert.equal(message.body_ar, "شاهد الكينج");
    assert.equal(message.data.url, "/content/shoofaflam/series/el-king");
    // A campaign that names {title} but has nothing to name falls back
    assert.equal(buildCampaignMessage({ ...campaign, body_en: "Watch {title}" }, [], null, "2026-10-14").body_en, DEFAULT_DISCOVERY.body_en);
});

test("clips text to the notification limits", () => {
    const long = buildCampaignMessage({ ...campaign, body_en: "x".repeat(500) }, [], null, "2026-10-14");
    assert.equal(long.body_en.length, 240);
    assert.ok(long.body_en.endsWith("…"));
});

test("content URLs match the app routes", () => {
    assert.equal(contentUrl({ provider: "trakt", type: "movie", id: "123" }), "/movie/123");
    assert.equal(contentUrl({ provider: "trakt", type: "series", id: "206790" }), "/content/trakt/series/206790");
});

test("catalog picks are recent, rated, Arabic and deterministic", () => {
    const rows = [
        { slug: "old", type: "movie", title_ar: "قديم", rating: 9, year: 1990, poster_path: "/a.jpg" },
        { slug: "unrated", type: "movie", title_ar: "جديد", rating: 0, year: 2026, poster_path: "/b.jpg" },
        { slug: "foreign", type: "movie", title_ar: "Foreign", rating: 8, year: 2026, poster_path: "/c.jpg" },
        { slug: "no-poster", type: "movie", title_ar: "بدون", rating: 8, year: 2026, poster_path: null },
        { slug: "el-king", type: "series", title_ar: "الكينج", title_en: "El King", rating: 7.4, year: 2026, poster_path: "/d.jpg" },
    ];
    const today = new Date("2026-10-14T00:00:00Z");
    const pick = pickCatalogRecommendation(rows, "c1:2026-10-14", today);
    assert.deepEqual(pick, rec);
    assert.deepEqual(pickCatalogRecommendation(rows, "c1:2026-10-14", today), pick);
    assert.equal(pickCatalogRecommendation(rows.slice(0, 4), "seed", today), null);
    assert.equal(pickCatalogRecommendation({ error: true }, "seed", today), null);
});
