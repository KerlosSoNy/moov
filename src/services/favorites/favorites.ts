import { supabase } from "@/lib/supabase";
import type { Movie } from "@/types/movie";

export async function fetchFavorites(): Promise<Movie[]> {
    const { data, error } = await supabase
        .from("favorites")
        .select("movie")
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data.map((row) => row.movie as Movie);
}

// Keep only what the movie cards need, not the whole Trakt payload
const snapshot = (movie: Movie) => ({
    ids: movie.ids,
    title: movie.title,
    year: movie.year,
    genres: movie.genres ?? [],
    rating: movie.rating,
    images: { poster: movie.images?.poster ?? [], fanart: movie.images?.fanart ?? [] },
});

export async function addFavorite(movie: Movie): Promise<void> {
    const { error } = await supabase
        .from("favorites")
        // Already saved is fine: do nothing instead of updating, so no UPDATE grant is needed
        .upsert(
            { movie_id: movie.ids.trakt, movie: snapshot(movie) },
            { onConflict: "user_id,movie_id", ignoreDuplicates: true },
        );
    if (error) throw error;
}

export async function removeFavorite(movieId: number): Promise<void> {
    const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("movie_id", movieId);
    if (error) throw error;
}
