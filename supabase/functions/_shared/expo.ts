// Expo Push API client. Maps each response to a per-delivery outcome the
// database understands (see notif_record_tickets / notif_record_receipts).
// https://docs.expo.dev/push-notifications/sending-notifications/

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
export const SEND_BATCH = 100; // Expo's per-request message limit
export const RECEIPT_BATCH = 1000; // Expo's per-request receipt id limit
const TIMEOUT_MS = 20_000;

export type OutgoingMessage = {
    id: number; // delivery id
    to: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
};

export type TicketOutcome = {
    id: number;
    status: "ticket_ok" | "ticket_error" | "retry" | "unknown";
    ticket_id?: string;
    error_code?: string;
    error_message?: string;
};

export type ReceiptOutcome = {
    id: number;
    status: "delivered" | "failed" | "missing";
    error_code?: string;
    error_message?: string;
};

function headers(): HeadersInit {
    const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
    return {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    };
}

type ExpoTicket = { status?: string; id?: string; message?: string; details?: { error?: string } };

export async function sendBatch(messages: OutgoingMessage[]): Promise<TicketOutcome[]> {
    const all = (status: TicketOutcome["status"], error_message: string, error_code?: string) =>
        messages.map((m) => ({ id: m.id, status, error_message, error_code }));

    let response: Response;
    try {
        response = await fetch(SEND_URL, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(
                messages.map((m) => ({
                    to: m.to,
                    title: m.title,
                    body: m.body,
                    data: m.data,
                    sound: "default",
                    channelId: "default",
                    priority: "high",
                })),
            ),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (error) {
        // The request may or may not have reached Expo: never resend blindly
        return all("unknown", `Request failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Rejected as a whole before processing: safe to retry later
    if (response.status === 429 || response.status >= 500) {
        return all("retry", `HTTP ${response.status}`);
    }

    let payload: { data?: ExpoTicket[]; errors?: { code?: string; message?: string }[] } | null = null;
    try {
        payload = await response.json();
    } catch {
        return all(response.ok ? "unknown" : "ticket_error", `HTTP ${response.status}: unreadable response`);
    }

    if (!response.ok || !Array.isArray(payload?.data)) {
        const error = payload?.errors?.[0];
        return all(response.ok ? "unknown" : "ticket_error", error?.message ?? `HTTP ${response.status}`, error?.code);
    }

    // Tickets come back in request order
    const tickets = payload.data;
    if (tickets.length !== messages.length) {
        return all("unknown", `Expected ${messages.length} tickets, got ${tickets.length}`);
    }
    return messages.map((m, i) => {
        const ticket = tickets[i];
        if (ticket?.status === "ok" && ticket.id) return { id: m.id, status: "ticket_ok", ticket_id: ticket.id };
        return {
            id: m.id,
            status: "ticket_error",
            error_code: ticket?.details?.error ?? "UnknownError",
            error_message: ticket?.message ?? "Expo returned an error ticket",
        };
    });
}

type ExpoReceipt = { status?: string; message?: string; details?: { error?: string } };

// Receipts missing from the response aren't ready yet and are retried later
export async function fetchReceipts(tickets: { id: number; ticket_id: string }[]): Promise<ReceiptOutcome[]> {
    const response = await fetch(RECEIPTS_URL, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ ids: tickets.map((t) => t.ticket_id) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`getReceipts HTTP ${response.status}`);
    const payload: { data?: Record<string, ExpoReceipt> } = await response.json();
    const receipts = payload.data ?? {};
    return tickets.map((t) => {
        const receipt = receipts[t.ticket_id];
        if (!receipt) return { id: t.id, status: "missing" };
        if (receipt.status === "ok") return { id: t.id, status: "delivered" };
        return {
            id: t.id,
            status: "failed",
            error_code: receipt.details?.error ?? "UnknownError",
            error_message: receipt.message ?? "Delivery failed",
        };
    });
}

export function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
}
