// Runs every minute from Supabase Cron (see migration *_notifications_cron.sql).
// Each run: open due campaign executions and fan them out to devices, turn
// reply/moderation events into deliveries, send queued deliveries to Expo,
// collect receipts, and refresh execution counts. Every step is idempotent and
// safe to overlap with another run (see the notif_* SQL functions).
//
// Auth: `Authorization: Bearer <CRON_SECRET>` (cron), or an admin user's JWT
// (admin panel "send test now"). Deploy with --no-verify-jwt; both are checked here.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { chunk, fetchReceipts, RECEIPT_BATCH, SEND_BATCH, sendBatch, type OutgoingMessage } from "../_shared/expo.ts";
import {
    buildCampaignMessage,
    EVENT_MESSAGES,
    fixedRecommendation,
    pickCatalogRecommendation,
    type Campaign,
    type LocalizedMessage,
    type Recommendation,
} from "../_shared/messages.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const CATALOG_URL = "https://shoofaflam.tv/api/titles.json";
// Leave headroom under the Edge Function wall clock and the cron HTTP timeout
const TIME_BUDGET_MS = 40_000;

function timingSafeEqual(a: string, b: string): boolean {
    const x = new TextEncoder().encode(a);
    const y = new TextEncoder().encode(b);
    if (x.length !== y.length) return false;
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
    return diff === 0;
}

async function isAuthorized(req: Request): Promise<boolean> {
    const header = req.headers.get("Authorization") ?? "";
    const token = header.replace(/^Bearer\s+/i, "");
    if (!token) return false;
    if (CRON_SECRET.length >= 32 && timingSafeEqual(token, CRON_SECRET)) return true;
    // Otherwise it must be a signed-in admin; is_admin() reads the role server side
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
    });
    const { data, error } = await asUser.rpc("is_admin");
    return !error && data === true;
}

// Unwraps a supabase-js response, turning `error` into a thrown Error. The
// caller names the expected shape, as the client here has no generated types.
async function must<T>(promise: PromiseLike<{ data: unknown; error: unknown }>, step: string): Promise<T> {
    const { data, error } = await promise;
    if (error) throw new Error(`${step}: ${JSON.stringify(error)}`);
    return data as T;
}

// Downloaded at most once per run, only when a campaign needs it
let catalog: Promise<unknown> | null = null;
const loadCatalog = () =>
    (catalog ??= fetch(CATALOG_URL, { signal: AbortSignal.timeout(15_000) }).then((r) => {
        if (!r.ok) throw new Error(`Catalog HTTP ${r.status}`);
        return r.json();
    }));

async function prepareCampaigns(db: SupabaseClient) {
    const due = await must<{ execution_id: string; campaign_id: string; scheduled_date: string }[]>(
        db.rpc("notif_claim_due_campaigns"),
        "claim campaigns",
    );
    if (!due.length) return { prepared: 0, queued: 0 };

    const templates = await must<LocalizedMessage[]>(
        db.from("notification_templates").select("title_ar, body_ar, title_en, body_en").eq("is_active", true).order("created_at"),
        "load templates",
    );

    let queued = 0;
    for (const run of due) {
        try {
            const campaign = await must<Campaign>(
                db.from("notification_campaigns").select("*").eq("id", run.campaign_id).single(),
                "load campaign",
            );
            let recommendation: Recommendation | null = null;
            if (campaign.recommendation_source === "fixed") {
                recommendation = fixedRecommendation(campaign);
            } else if (campaign.recommendation_source === "catalog") {
                // A catalog outage degrades to a plain discovery message
                recommendation = await loadCatalog()
                    .then((rows) => pickCatalogRecommendation(rows, `${campaign.id}:${run.scheduled_date}`))
                    .catch((error) => {
                        console.warn("Catalog unavailable", error);
                        return null;
                    });
            }
            const message = buildCampaignMessage(campaign, templates, recommendation, run.scheduled_date);
            queued += await must<number>(
                db.rpc("notif_prepare_execution", { p_execution_id: run.execution_id, p_message: message }),
                "prepare execution",
            );
        } catch (error) {
            // Left in 'preparing': retried next minute, marked failed after a day
            console.error(`Campaign run ${run.execution_id} failed`, error);
            await db.from("campaign_executions").update({ error: String(error).slice(0, 500) }).eq("id", run.execution_id);
        }
    }
    return { prepared: due.length, queued };
}

async function sendQueued(db: SupabaseClient, deadline: number) {
    let sent = 0;
    while (Date.now() < deadline) {
        const claimed = await must<{ id: number; expo_push_token: string; title: string; body: string; data: Record<string, unknown> }[]>(
            db.rpc("notif_claim_queued", { p_limit: SEND_BATCH * 5 }),
            "claim queued",
        );
        if (!claimed.length) break;
        const rows: OutgoingMessage[] = claimed.map(({ expo_push_token, ...rest }) => ({ ...rest, to: expo_push_token }));
        for (const batch of chunk(rows, SEND_BATCH)) {
            const outcomes = await sendBatch(batch);
            await must(db.rpc("notif_record_tickets", { p_results: outcomes }), "record tickets");
            sent += batch.length;
        }
    }
    return sent;
}

async function checkReceipts(db: SupabaseClient, deadline: number) {
    let checked = 0;
    const pending = await must<{ id: number; ticket_id: string }[]>(
        db.rpc("notif_pending_receipts", { p_limit: RECEIPT_BATCH * 3 }),
        "pending receipts",
    );
    for (const batch of chunk(pending, RECEIPT_BATCH)) {
        if (Date.now() >= deadline) break;
        try {
            const outcomes = await fetchReceipts(batch);
            await must(db.rpc("notif_record_receipts", { p_results: outcomes }), "record receipts");
            checked += outcomes.filter((o) => o.status !== "missing").length;
        } catch (error) {
            // Receipts stay pending and are fetched on a later run
            console.warn("Receipt check failed", error);
        }
    }
    return checked;
}

Deno.serve(async (req) => {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    if (!(await isAuthorized(req))) return new Response("Unauthorized", { status: 401 });

    const deadline = Date.now() + TIME_BUDGET_MS;
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    try {
        const campaigns = await prepareCampaigns(db);
        const events = await must<number>(db.rpc("notif_expand_events", { p_messages: EVENT_MESSAGES }), "expand events");
        const sent = await sendQueued(db, deadline);
        const receipts = await checkReceipts(db, deadline);
        await must(db.rpc("notif_finalize_executions"), "finalize executions");
        const summary = { campaigns, events, sent, receipts };
        if (campaigns.prepared || events || sent || receipts) console.log(JSON.stringify(summary));
        return Response.json(summary);
    } catch (error) {
        console.error(error);
        return Response.json({ error: String(error) }, { status: 500 });
    }
});
