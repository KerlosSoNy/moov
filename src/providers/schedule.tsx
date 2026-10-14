import { useAuth } from "@/providers/auth";
import {
    cancelReminder,
    deleteSchedule,
    fetchSchedule,
    saveSchedule,
    setReminder,
    type ScheduleEntry,
} from "@/services/schedule/schedule";
import type { ContentItem, ContentRef } from "@/types/content";
import { createContext, use, useEffect, useState, type ReactNode } from "react";

type Status = "loading" | "error" | "ready";

type ReminderText = { title: string; body: string };

type Schedule = {
    entries: ScheduleEntry[];
    status: Status;
    entryFor: (ref: ContentRef) => ScheduleEntry | undefined;
    // reminder: text for a local notification at that time, or null for none
    schedule: (item: ContentItem, at: Date, reminder: ReminderText | null) => Promise<ScheduleEntry>;
    unschedule: (entry: ScheduleEntry) => Promise<void>;
    reload: () => void;
};

const ScheduleContext = createContext<Schedule | null>(null);

const byTime = (a: ScheduleEntry, b: ScheduleEntry) => a.scheduledAt.getTime() - b.scheduledAt.getTime();

export function ScheduleProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const userId = user?.id;
    const [attempt, setAttempt] = useState(0);
    // Tagged with the owner so a previous account's schedule never shows after switching users
    const [state, setState] = useState<{ owner: string; key: number; entries: ScheduleEntry[]; error: boolean } | null>(null);
    const current = state && state.owner === userId && state.key === attempt ? state : null;
    const entries = current?.entries ?? [];
    const status: Status = !current ? "loading" : current.error ? "error" : "ready";

    useEffect(() => {
        if (!userId) return;
        let stale = false;
        fetchSchedule()
            .then((list) => !stale && setState({ owner: userId, key: attempt, entries: list, error: false }))
            .catch((e) => {
                if (stale) return;
                console.warn(e);
                setState({ owner: userId, key: attempt, entries: [], error: true });
            });
        return () => {
            stale = true;
        };
    }, [userId, attempt]);

    const setEntries = (change: (list: ScheduleEntry[]) => ScheduleEntry[]) =>
        setState((s) => (s ? { ...s, entries: change(s.entries).sort(byTime) } : s));

    const entryFor = (ref: ContentRef) =>
        entries.find((e) => e.provider === ref.provider && e.type === ref.type && e.contentId === ref.id);

    const schedule = async (item: ContentItem, at: Date, reminder: ReminderText | null) => {
        const entry = await saveSchedule(item, at);
        setEntries((list) => [...list.filter((e) => e.id !== entry.id), entry]);
        // The entry is saved either way; a reminder failure only loses the reminder
        try {
            if (reminder) await setReminder(entry, reminder);
            else await cancelReminder(entry.id);
        } catch (e) {
            console.warn("Couldn't set reminder", e);
        }
        return entry;
    };

    const unschedule = async (entry: ScheduleEntry) => {
        await deleteSchedule(entry.id);
        setEntries((list) => list.filter((e) => e.id !== entry.id));
        await cancelReminder(entry.id);
    };

    return (
        <ScheduleContext
            value={{ entries, status, entryFor, schedule, unschedule, reload: () => setAttempt((n) => n + 1) }}
        >
            {children}
        </ScheduleContext>
    );
}

export function useSchedule() {
    const ctx = use(ScheduleContext);
    if (!ctx) {
        throw new Error("useSchedule must be used inside ScheduleProvider");
    }
    return ctx;
}
