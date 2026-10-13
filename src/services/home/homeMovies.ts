import { apiRequest } from "@/lib/fetchInstance";
import type { Movie } from "@/types/movie";

export type HomeMovies = {
    trending: Movie[];
    popular: Movie[];
    boxOffice: Movie[];
    comingSoon: Movie[];
};

const EXT = "extended=full,images";

// Trending, box office and anticipated wrap each movie as { movie }; popular returns movies directly
const unwrap = (items: { movie: Movie }[]) => items.map((item) => item.movie);

export async function fetchHomeMovies(signal?: AbortSignal): Promise<HomeMovies> {
    const [trending, popular, boxOffice, comingSoon] = await Promise.all([
        apiRequest<{ movie: Movie }[]>(`/movies/trending?${EXT}&limit=10`, { signal }),
        apiRequest<Movie[]>(`/movies/popular?${EXT}&limit=15`, { signal }),
        apiRequest<{ movie: Movie }[]>(`/movies/boxoffice?${EXT}`, { signal }),
        apiRequest<{ movie: Movie }[]>(`/movies/anticipated?${EXT}&limit=15`, { signal }),
    ]);

    return {
        trending: unwrap(trending),
        popular,
        boxOffice: unwrap(boxOffice),
        comingSoon: unwrap(comingSoon),
    };
}
