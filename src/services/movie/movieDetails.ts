import { apiRequest } from "@/lib/fetchInstance";
import type { Movie, MovieDetails, MoviePeople } from "@/types/movie";

const EXT = "extended=full,images";

export function fetchMovie(slug: string, signal?: AbortSignal) {
    return apiRequest<MovieDetails>(`/movies/${slug}?${EXT}`, { signal });
}

export function fetchMoviePeople(slug: string, signal?: AbortSignal) {
    return apiRequest<MoviePeople>(`/movies/${slug}/people?extended=images`, { signal });
}

export function fetchRelatedMovies(slug: string, signal?: AbortSignal) {
    return apiRequest<Movie[]>(`/movies/${slug}/related?${EXT}&limit=15`, { signal });
}
