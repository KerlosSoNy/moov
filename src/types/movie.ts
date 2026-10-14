export type Movie = {
    id: string;
    title: string;
    ids: {
        trakt: number;
        slug: string;
    };
    year: number;
    genres: string[];
    images:{
        poster: string[];
        fanart?: string[];
    },
    rating: number;
    poster: string;
    overview?: string;
    trailer?: string | null;
};

// Extra fields returned by /movies/{slug}?extended=full
export type MovieDetails = Movie & {
    runtime?: number | null;
    votes?: number;
    certification?: string | null;
    tagline?: string | null;
};

export type Person = {
    name: string;
    ids: {
        trakt: number;
        slug: string;
    };
    images?: {
        headshot?: string[];
        fanart?: string[];
    };
    biography?: string | null;
    birthday?: string | null;
    birthplace?: string | null;
    death?: string | null;
    known_for_department?: string | null;
};

export type CastMember = { character?: string; person: Person };
export type CrewMember = { job?: string; person: Person };
export type MoviePeople = {
    cast?: CastMember[];
    crew?: Record<string, CrewMember[]>;
};
