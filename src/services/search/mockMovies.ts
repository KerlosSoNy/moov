import type { Movie } from "@/types/movie";

// Placeholder data until the real API is wired up
const poster = (seed: string) => `https://picsum.photos/seed/${seed}/200/300`;

export const MOCK_MOVIES: Movie[] = [
    { id: "1", title: "Inception", year: 2010, genres: ["Sci-Fi", "Action"], rating: 8.8, poster: poster("inception") },
    { id: "2", title: "Interstellar", year: 2014, genres: ["Sci-Fi", "Drama"], rating: 8.7, poster: poster("interstellar") },
    { id: "3", title: "The Dark Knight", year: 2008, genres: ["Action", "Crime"], rating: 9.0, poster: poster("darkknight") },
    { id: "4", title: "Parasite", year: 2019, genres: ["Thriller", "Drama"], rating: 8.5, poster: poster("parasite") },
    { id: "5", title: "Spirited Away", year: 2001, genres: ["Animation", "Fantasy"], rating: 8.6, poster: poster("spirited") },
    { id: "6", title: "The Matrix", year: 1999, genres: ["Sci-Fi", "Action"], rating: 8.7, poster: poster("matrix") },
    { id: "7", title: "Whiplash", year: 2014, genres: ["Drama", "Music"], rating: 8.5, poster: poster("whiplash") },
    { id: "8", title: "Dune: Part Two", year: 2024, genres: ["Sci-Fi", "Adventure"], rating: 8.6, poster: poster("dune2") },
    { id: "9", title: "Oppenheimer", year: 2023, genres: ["Drama", "History"], rating: 8.3, poster: poster("oppenheimer") },
    { id: "10", title: "Mad Max: Fury Road", year: 2015, genres: ["Action", "Adventure"], rating: 8.1, poster: poster("madmax") },
    { id: "11", title: "Get Out", year: 2017, genres: ["Horror", "Thriller"], rating: 7.8, poster: poster("getout") },
    { id: "12", title: "La La Land", year: 2016, genres: ["Romance", "Music"], rating: 8.0, poster: poster("lalaland") },
    { id: "13", title: "Coco", year: 2017, genres: ["Animation", "Family"], rating: 8.4, poster: poster("coco") },
    { id: "14", title: "Joker", year: 2019, genres: ["Crime", "Drama"], rating: 8.4, poster: poster("joker") },
    { id: "15", title: "Everything Everywhere All at Once", year: 2022, genres: ["Sci-Fi", "Comedy"], rating: 7.8, poster: poster("eeaao") },
    { id: "16", title: "The Grand Budapest Hotel", year: 2014, genres: ["Comedy", "Drama"], rating: 8.1, poster: poster("budapest") },
];
