// Run: npm run test:unit (Node's built-in runner with native TypeScript)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    catalogGenres,
    dedupe,
    filterCatalog,
    normalizeSearchText,
    normalizeShoofCatalog,
    normalizeShoofTitle,
    normalizeTraktTitle,
    searchCatalog,
    twinKey,
} from "../../src/services/content/normalize.ts";

// Real row shapes from https://shoofaflam.tv/api/titles.json (Oct 2026)
const ROWS = [
    { slug: "ras-al-afaa", title_ar: "رأس الأفعى", title_en: "Ras Al-Afaa", year: 2026, type: "series", rating: 7.5, platforms: ["watchit", "on"], genre: "thriller", poster_path: "/j9lhilpqbKmrorXDN1MAiuRanA3.jpg", vote_average: 7 },
    { slug: "hobb-wa-dalaa", title_ar: "حب ودلع", title_en: "Hobb wa Dalaa", year: 1959, type: "movie", rating: 0.0, platforms: [], genre: "drama", poster_path: "/8Z4rhqYGWTtSGDBmQBIDk2JLbPx.jpg" },
    { slug: "nohad-al-chami-a-sign-of-faith", title_ar: "Nohad Al Chami: A Sign of Faith", title_en: "Nohad Al Chami: A Sign of Faith", year: 2025, type: "movie", rating: 0.0, platforms: [], genre: "drama", poster_path: null },
    { slug: "valley-of-the-dead", title_ar: "وادي الموتى", title_en: "Valley of the Dead", year: 2020, type: "movie", rating: 6.2, platforms: ["netflix"], genre: "comedy", poster_path: "/lRIAVaJ96OUPLseziy7CCfWwI5X.jpg", vote_average: 6.2 },
];

test("normalizes a Shoof Aflam row", () => {
    const item = normalizeShoofTitle(ROWS[0]);
    assert.deepEqual(item, {
        provider: "shoofaflam",
        type: "series",
        id: "ras-al-afaa",
        key: "shoofaflam:series:ras-al-afaa",
        slug: "ras-al-afaa",
        titleAr: "رأس الأفعى",
        titleEn: "Ras Al-Afaa",
        poster: "https://image.tmdb.org/t/p/w342/j9lhilpqbKmrorXDN1MAiuRanA3.jpg",
        backdrop: null,
        year: 2026,
        originalLanguage: null,
        country: null,
        genres: ["thriller"],
        rating: 7.5,
        overview: null,
        platforms: ["watchit", "on"],
    });
});

test("treats 0 as unrated, untranslated titles as non-Arabic, and missing posters as null", () => {
    assert.equal(normalizeShoofTitle(ROWS[1])?.rating, null);
    const untranslated = normalizeShoofTitle(ROWS[2]);
    assert.equal(untranslated?.titleAr, null);
    assert.equal(untranslated?.poster, null);
    assert.equal(normalizeShoofTitle({ ...ROWS[1], rating: 0, vote_average: 5.5 })?.rating, 5.5);
});

test("accepts the documented `genres` array as well as the live `genre` string", () => {
    assert.deepEqual(normalizeShoofTitle({ ...ROWS[0], genre: undefined, genres: ["drama", "crime"] })?.genres, ["drama", "crime"]);
});

test("rejects malformed rows and survives junk in the feed", () => {
    for (const bad of [null, 42, "x", [], {}, { slug: "a" }, { slug: "a", type: "show", title_en: "A" }, { slug: "", type: "movie", title_en: "A" }, { slug: "a", type: "movie" }]) {
        assert.equal(normalizeShoofTitle(bad), null);
    }
    const items = normalizeShoofCatalog([...ROWS, null, { nope: true }, ROWS[0], { ...ROWS[3], slug: "valley-of-the-dead-2" }]);
    assert.deepEqual(items.map((i) => i.id), ["ras-al-afaa", "hobb-wa-dalaa", "nohad-al-chami-a-sign-of-faith", "valley-of-the-dead"]);
    assert.throws(() => normalizeShoofCatalog({ error: "down" }));
    assert.equal(normalizeShoofTitle({ ...ROWS[0], year: "2026", rating: "7" })?.year, null);
});

test("normalizes Trakt movies and shows", () => {
    const show = normalizeTraktTitle(
        {
            title: "Pluribus",
            year: 2025,
            ids: { trakt: 206790, slug: "pluribus" },
            images: { poster: ["media.trakt.tv/images/shows/000/206/790/posters/medium/e255ecc15c.jpg.webp"], fanart: [] },
            rating: 8.253992080688477,
            language: "en",
            country: "us",
            genres: ["drama"],
            overview: "The most miserable person on Earth must save the world from happiness.",
        },
        "series",
    );
    assert.equal(show?.key, "trakt:series:206790");
    assert.equal(show?.poster, "https://media.trakt.tv/images/shows/000/206/790/posters/medium/e255ecc15c.jpg.webp");
    assert.equal(show?.backdrop, null);
    assert.equal(show?.rating, 8.3);
    assert.equal(show?.titleAr, null);
    assert.equal(normalizeTraktTitle({ title: "x", ids: { slug: "x" } }, "movie"), null);
    assert.equal(normalizeTraktTitle(undefined, "movie"), null);
});

test("dedupe keeps the first of each key", () => {
    const a = normalizeShoofTitle(ROWS[0])!;
    assert.equal(dedupe([a, { ...a }, normalizeShoofTitle(ROWS[1])!]).length, 2);
});

test("Arabic search folds letter variants and diacritics", () => {
    assert.equal(normalizeSearchText("أَحْمَد"), "احمد");
    assert.equal(normalizeSearchText("مدرسة"), normalizeSearchText("مدرسه"));
    const catalog = normalizeShoofCatalog(ROWS);
    assert.deepEqual(filterCatalog(catalog, { type: "series", query: "راس الافعي" }).map((i) => i.id), ["ras-al-afaa"]);
    assert.deepEqual(filterCatalog(catalog, { type: "movie", query: "valley" }).map((i) => i.id), ["valley-of-the-dead"]);
});

test("filters by type, Arabic title and genre, and sorts", () => {
    const catalog = normalizeShoofCatalog(ROWS);
    const arabicMovies = filterCatalog(catalog, { type: "movie", arabicOnly: true });
    assert.deepEqual(arabicMovies.map((i) => i.id), ["hobb-wa-dalaa", "valley-of-the-dead"]);
    assert.deepEqual(filterCatalog(catalog, { type: "movie", sort: "newest" }).map((i) => i.year), [2025, 2020, 1959]);
    assert.deepEqual(filterCatalog(catalog, { type: "movie", genre: "comedy" }).map((i) => i.id), ["valley-of-the-dead"]);
    assert.deepEqual(catalogGenres(catalog, "movie"), ["drama", "comedy"]);
    // Sorting returns a new array and leaves the cached catalog's order alone
    filterCatalog(catalog, { type: "movie", sort: "rating" });
    assert.equal(catalog[0].id, "ras-al-afaa");
});

test("search ranks exact, then prefix, then word, then substring matches, in either language", () => {
    const rows = [
        { slug: "a", type: "series", title_ar: "الملك والكتابة", title_en: "Writing King", year: 2020, rating: 9, genre: "drama", poster_path: "/a.jpg", platforms: [] },
        { slug: "b", type: "series", title_ar: "الكينج", title_en: "El King", year: 2026, rating: 7, genre: "drama", poster_path: "/b.jpg", platforms: [] },
        { slug: "c", type: "movie", title_ar: "الكينج 2", title_en: "El King 2", year: 2027, rating: 8, genre: "action", poster_path: "/c.jpg", platforms: [] },
        { slug: "d", type: "movie", title_ar: "بيت الملك", title_en: "Kingdom House", year: 2010, rating: 5, genre: "drama", poster_path: null, platforms: [] },
    ];
    const catalog = normalizeShoofCatalog(rows);
    assert.deepEqual(searchCatalog(catalog, "الكينج").map((i) => i.id), ["b", "c"]);
    assert.deepEqual(searchCatalog(catalog, "el king").map((i) => i.id), ["b", "c"]);
    assert.equal(searchCatalog(catalog, "king")[0].id, "d");
    assert.deepEqual(searchCatalog(catalog, "", { genre: "action" }).map((i) => i.id), ["c"]);
    assert.deepEqual(searchCatalog(catalog, ""), []);
    assert.equal(searchCatalog(catalog, "الملك").length, 2);
});

test("twin keys match the same title across providers", () => {
    const shoof = normalizeShoofTitle({ slug: "dune", type: "movie", title_ar: "كثيب", title_en: "Dune", year: 2021, rating: 8, genre: "sci-fi", poster_path: "/x.jpg", platforms: [] })!;
    const trakt = normalizeTraktTitle({ title: "Dune", year: 2021, ids: { trakt: 1, slug: "dune-2021" } }, "movie")!;
    assert.equal(twinKey(shoof), twinKey(trakt));
    assert.notEqual(twinKey(shoof), twinKey({ ...trakt, type: "series" }));
});
