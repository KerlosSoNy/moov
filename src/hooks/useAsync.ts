import { useCallback, useEffect, useState } from "react";

export type AsyncStatus = "loading" | "error" | "ready";

// Runs `load` when `key` changes and tracks its result. Each caller owns its
// own state, so one failing request never takes down its neighbours.
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<{ key: string; data?: T; error?: unknown } | null>(null);
    const fullKey = `${key}#${attempt}`;

    useEffect(() => {
        const controller = new AbortController();
        load(controller.signal)
            .then((data) => !controller.signal.aborted && setState({ key: fullKey, data }))
            .catch((error) => {
                if (controller.signal.aborted) return;
                console.warn(error);
                setState({ key: fullKey, error });
            });
        return () => controller.abort();
        // `load` is expected to change only with `key`
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fullKey]);

    const current = state?.key === fullKey ? state : null;
    const status: AsyncStatus = !current ? "loading" : "error" in current ? "error" : "ready";
    const retry = useCallback(() => setAttempt((n) => n + 1), []);

    // While reloading, keep showing the previous data instead of flashing a skeleton
    return { data: current?.data ?? state?.data, status, retry };
}
