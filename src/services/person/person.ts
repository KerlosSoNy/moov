import { apiRequest } from "@/lib/fetchInstance";
import type { Movie, MovieDetails, Person } from "@/types/movie";

type PersonCredits = {
    cast?: { character?: string; characters?: string[]; movie: MovieDetails }[];
    crew?: Record<string, { job?: string; jobs?: string[]; movie: MovieDetails }[]>;
};

// One movie in a department, with every character/job the person had on it
export type Credit = { movie: MovieDetails; roles: string[] };

export type PersonMovies = {
    knownFor: Movie[];
    // Keyed by department: "acting" for cast credits, Trakt's crew keys otherwise
    filmography: Record<string, Credit[]>;
};

const KNOWN_FOR_LIMIT = 20;

export function fetchPerson(slug: string, signal?: AbortSignal) {
    return apiRequest<Person>(`/people/${slug}?extended=full,images`, { signal });
}

// Merges duplicate entries of the same movie (e.g. several jobs) and orders
// newest first, with unreleased movies (no year yet) at the top
function toCredits(entries: { movie: MovieDetails; roles: string[] }[]): Credit[] {
    const byMovie = new Map<number, Credit>();
    for (const { movie, roles } of entries) {
        const existing = byMovie.get(movie.ids.trakt);
        if (existing) {
            existing.roles = [...new Set([...existing.roles, ...roles])];
        } else {
            byMovie.set(movie.ids.trakt, { movie, roles });
        }
    }
    return [...byMovie.values()].sort(
        (a, b) => (b.movie.year ?? Infinity) - (a.movie.year ?? Infinity),
    );
}

export async function fetchPersonMovies(slug: string, signal?: AbortSignal): Promise<PersonMovies> {
    const credits = await apiRequest<PersonCredits>(
        `/people/${slug}/movies?extended=full,images`,
        { signal },
    );

    const filmography: Record<string, Credit[]> = {};
    if (credits.cast?.length) {
        filmography.acting = toCredits(
            credits.cast.map(({ movie, character, characters }) => ({
                movie,
                roles: (characters?.length ? characters : [character]).filter((r): r is string => !!r),
            })),
        );
    }
    for (const [department, entries] of Object.entries(credits.crew ?? {})) {
        if (!entries.length) continue;
        filmography[department] = toCredits(
            entries.map(({ movie, job, jobs }) => ({
                movie,
                roles: (jobs?.length ? jobs : [job]).filter((r): r is string => !!r),
            })),
        );
    }

    // Trakt returns credits unsorted and full of cameos, so rank every credit
    // by vote count to surface what the person is known for
    const unique = new Map(
        Object.values(filmography).flat().map(({ movie }) => [movie.ids.trakt, movie]),
    );
    const knownFor = [...unique.values()]
        .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
        .slice(0, KNOWN_FOR_LIMIT);

    return { knownFor, filmography };
}
