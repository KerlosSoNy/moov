import { supabase } from "@/lib/supabase";
import type { ContentRef } from "@/types/content";

export type CommunityRating = {
    // Moov users' average on a 1–5 scale; null until someone rates
    average: number | null;
    count: number;
    mine: number | null;
};

type Row = { average: number | string | null; rating_count: number; my_rating: number | null };

const toRating = (rows: Row[] | null): CommunityRating => {
    const row = rows?.[0];
    return {
        average: row?.average === null || row?.average === undefined ? null : Number(row.average),
        count: row?.rating_count ?? 0,
        mine: row?.my_rating ?? null,
    };
};

const refParams = (ref: ContentRef) => ({ p_provider: ref.provider, p_type: ref.type, p_content_id: ref.id });

// Aggregates are computed in the database; only one row comes back
export async function fetchCommunityRating(ref: ContentRef): Promise<CommunityRating> {
    const { data, error } = await supabase.rpc("get_content_rating", refParams(ref));
    if (error) throw error;
    return toRating(data as Row[]);
}

// rating 1–5 sets it, null removes it; resolves to the fresh aggregate
export async function setCommunityRating(ref: ContentRef, rating: number | null): Promise<CommunityRating> {
    if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) {
        throw new RangeError("Rating must be 1–5");
    }
    const { data, error } = await supabase.rpc("set_content_rating", { ...refParams(ref), p_rating: rating });
    if (error) throw error;
    return toRating(data as Row[]);
}
