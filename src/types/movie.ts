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
