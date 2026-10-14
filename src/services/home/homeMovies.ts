import { apiRequest } from "@/lib/fetchInstance";
import type { Movie } from "@/types/movie";

export type HomeMovieList = "trending" | "boxOffice" | "comingSoon";

const EXT = "extended=full,images";

// Each list wraps every movie as { movie }
const ENDPOINTS: Record<HomeMovieList, string> = {
    trending: `/movies/trending?${EXT}&limit=10`,
    boxOffice: `/movies/boxoffice?${EXT}`,
    comingSoon: `/movies/anticipated?${EXT}&limit=15`,
};

// One list per call so a failing list only hides its own row
export async function fetchHomeMovieList(list: HomeMovieList, signal?: AbortSignal): Promise<Movie[]> {
    const items = await apiRequest<{ movie?: Movie }[]>(ENDPOINTS[list], { signal });
    return Array.isArray(items)
        ? items.map((item) => item.movie).filter((movie): movie is Movie => !!movie?.ids?.trakt)
        : [];
}
