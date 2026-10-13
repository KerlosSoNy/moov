
import { useCallback, useEffect, useState } from "react";

export type SearchStatus = "idle" | "loading" | "success" | "error";

type SearchFn<T> = (query: string, signal: AbortSignal) => Promise<T[]>;

type Options = {
  debounceMs?: number;
  minLength?: number;
  // Extra filter (e.g. a genre); changing it re-runs the search
  scope?: string;
};

type Response<T> = {
  key: string;
  results: T[];
  error: Error | null;
};

const EMPTY: never[] = [];

export function useSearch<T>(
  search: SearchFn<T>,
  { debounceMs = 300, minLength = 1, scope = "" }: Options = {},
) {
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<Response<T> | null>(null);

  const trimmed = query.trim();
  const active = trimmed.length >= minLength;
  const key = `${attempt}:${scope}:${trimmed}`;

  useEffect(() => {
    if (!active) return;

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const results = await search(trimmed, controller.signal);

        if (!controller.signal.aborted) {
          setResponse({
            key,
            results,
            error: null,
          });
        }
      } catch (error) {
        if (controller.signal.aborted) return;

        setResponse({
          key,
          results: [],
          error:
            error instanceof Error
              ? error
              : new Error("Something went wrong"),
        });
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, trimmed, key, debounceMs, search]);

  const current = active && response?.key === key ? response : null;

  const status: SearchStatus = !active
    ? "idle"
    : !current
      ? "loading"
      : current.error
        ? "error"
        : "success";

  const clear = useCallback(() => setQuery(""), []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    query,
    setQuery,
    clear,
    retry,
    status,
    results: current?.results ?? (EMPTY as T[]),
    error: current?.error ?? null,
  };
}
