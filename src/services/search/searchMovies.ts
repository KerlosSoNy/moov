import { apiRequest } from "@/lib/fetchInstance";
import type { Movie } from "@/types/movie";

export type SearchResult = { movie: Movie };

export async function searchMovies(
    query: string,
    signal: AbortSignal,
    genre?: string,
): Promise<SearchResult[]> {
    const genreParam = genre ? `&genres=${encodeURIComponent(genre)}` : "";

    // No text query: browse popular movies in the selected genre
    if (!query && genre) {
        const movies = await apiRequest<Movie[]>(
            `/movies/popular?extended=full,images&limit=30${genreParam}`,
            { signal },
        );
        return movies.map((movie) => ({ movie }));
    }

    return apiRequest<SearchResult[]>(
        `/search/movie?query=${encodeURIComponent(query)}&extended=full,images${genreParam}`,
        { signal },
    );
}
