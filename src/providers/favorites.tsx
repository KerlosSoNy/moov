import { useAuth } from "@/providers/auth";
import {
    addFavorite,
    fetchFavorites,
    removeFavorite,
} from "@/services/favorites/favorites";
import type { Movie } from "@/types/movie";
import { createContext, use, useEffect, useState, type ReactNode } from "react";

type Status = "loading" | "error" | "ready";

type Favorites = {
    favorites: Movie[];
    status: Status;
    isFavorite: (movieId: number) => boolean;
    toggleFavorite: (movie: Movie) => Promise<void>;
    reload: () => Promise<void>;
};

const FavoritesContext = createContext<Favorites | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const userId = user?.id;
    // Tagged with the owner so a previous account's list never shows after switching users
    const [state, setState] = useState<{ owner?: string; movies: Movie[]; status: Status }>(
        { movies: [], status: "loading" },
    );
    const current = state.owner === userId;
    const favorites = current ? state.movies : [];
    const status: Status = current ? state.status : "loading";
    const setFavorites = (movies: Movie[]) => setState((s) => ({ ...s, movies }));

    const load = (owner: string) =>
        fetchFavorites()
            .then((movies) => setState({ owner, movies, status: "ready" }))
            .catch((e) => {
                console.error(e);
                setState({ owner, movies: [], status: "error" });
            });

    useEffect(() => {
        if (!userId) return;
        let stale = false;
        fetchFavorites()
            .then((movies) => {
                if (!stale) setState({ owner: userId, movies, status: "ready" });
            })
            .catch((e) => {
                if (stale) return;
                console.error(e);
                setState({ owner: userId, movies: [], status: "error" });
            });
        return () => {
            stale = true;
        };
    }, [userId]);

    const reload = async () => {
        if (!userId) return;
        setState((s) => ({ ...s, status: "loading" }));
        await load(userId);
    };

    const isFavorite = (movieId: number) =>
        favorites.some((m) => m.ids.trakt === movieId);

    // Optimistic: flip the heart immediately and roll back if the request fails
    const toggleFavorite = async (movie: Movie) => {
        const id = movie.ids.trakt;
        const previous = favorites;
        const wasFavorite = isFavorite(id);
        setFavorites(
            wasFavorite
                ? favorites.filter((m) => m.ids.trakt !== id)
                : [movie, ...favorites],
        );
        try {
            if (wasFavorite) await removeFavorite(id);
            else await addFavorite(movie);
        } catch (e) {
            console.error(e);
            setFavorites(previous);
            throw e;
        }
    };

    return (
        <FavoritesContext value={{ favorites, status, isFavorite, toggleFavorite, reload }}>
            {children}
        </FavoritesContext>
    );
}

export function useFavorites() {
    const ctx = use(FavoritesContext);
    if (!ctx) {
        throw new Error("useFavorites must be used inside FavoritesProvider");
    }
    return ctx;
}
