// Database tests for the Supabase migrations: RLS, constraints, RPCs and the
// notification dispatcher's idempotency. Runs the real migration files in
// PGlite (Postgres compiled to WASM) — no Docker or Supabase CLI needed.
//
//   npm run test:db
//
// Supabase-specific pieces are stubbed: the auth schema, auth.uid() and the
// API roles. Default privileges grant everything to the API roles, which is
// the most permissive Supabase setting, so the migrations' explicit revokes
// are what's being tested. pg_cron / pg_net / storage migrations are skipped.
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

const MIGRATIONS = join(import.meta.dirname, "..", "supabase", "migrations");
const SKIP = [/avatars/, /cron/];

const STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const USERS = {
    alice: "00000000-0000-0000-0000-00000000000a",
    bob: "00000000-0000-0000-0000-00000000000b",
    carol: "00000000-0000-0000-0000-00000000000c", // moderator
    dana: "00000000-0000-0000-0000-00000000000d", // admin
};

const MOVIE = ["trakt", "movie", "123"];

let db;

// Runs a query as a signed-in user (role authenticated + JWT sub), as PostgREST does
async function as(user, sql, params = []) {
    const role = user === "anon" ? "anon" : user === "service" ? "service_role" : "authenticated";
    const sub = USERS[user] ?? "";
    await db.exec(`select set_config('request.jwt.claim.sub', '${sub}', false); set role ${role};`);
    try {
        return (await db.query(sql, params)).rows;
    } finally {
        await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    }
}

const sys = async (sql, params = []) => (await db.query(sql, params)).rows;

// Rejection whose message or SQLSTATE matches
const fails = (promise, pattern) =>
    assert.rejects(promise, (error) => {
        const text = `${error.code ?? ""} ${error.message}`;
        assert.match(text, pattern);
        return true;
    });

before(async () => {
    db = new PGlite({ extensions: { pg_trgm } });
    await db.exec(STUB);
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && !SKIP.some((re) => re.test(f))).sort();
    for (const file of files) {
        try {
            await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
        } catch (error) {
            throw new Error(`${file}: ${error.message}`);
        }
    }
    await db.exec(`grant all on all tables in schema public to service_role;`);
    for (const [name, id] of Object.entries(USERS)) {
        await sys(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
            id,
            `${name}@example.com`,
            { name: name[0].toUpperCase() + name.slice(1), avatar_url: name === "bob" ? "javascript:alert(1)" : `https://img.example/${name}.png` },
        ]);
    }
    await sys(`insert into public.admin_users (user_id, role) values ($1, 'moderator'), ($2, 'admin')`, [USERS.carol, USERS.dana]);
});

after(async () => db?.close());

const addComment = (user, content, parent = null, ref = MOVIE) =>
    as(
        user,
        `insert into public.comments (content_provider, content_type, content_id, content, parent_comment_id)
         values ($1, $2, $3, $4, $5) returning id`,
        [...ref, content, parent],
    ).then((rows) => rows[0].id);

// Backdates a user's comments past the rate-limit window (bypassing the
// trigger that keeps created_at immutable)
async function ageComments(userId) {
    await db.exec(`set session_replication_role = replica`);
    await sys(`update public.comments set created_at = now() - interval '2 minutes' where user_id = $1`, [userId]);
    await db.exec(`set session_replication_role = default`);
}

const thread = (user, parent = null, ref = MOVIE) =>
    as(user, `select * from public.get_comments($1, $2, $3, $4)`, [...ref, parent]);

describe("profiles and roles", () => {
    test("profiles mirror auth metadata and drop non-https avatars", async () => {
        const rows = await as("alice", `select id, display_name, avatar_url from public.profiles order by display_name`);
        assert.equal(rows.length, 4);
        assert.equal(rows.find((r) => r.id === USERS.bob).avatar_url, null);
        await sys(`update auth.users set raw_user_meta_data = '{"name":"Alice B"}' where id = $1`, [USERS.alice]);
        const [alice] = await as("bob", `select display_name from public.profiles where id = $1`, [USERS.alice]);
        assert.equal(alice.display_name, "Alice B");
    });

    test("users cannot read or grant roles", async () => {
        await fails(as("bob", `select * from public.admin_users`), /permission denied/);
        await fails(as("bob", `insert into public.admin_users values ($1, 'admin')`, [USERS.bob]), /permission denied/);
        await fails(as("bob", `select public.admin_set_staff_role($1, 'admin')`, [USERS.bob]), /Not authorized/);
        await fails(as("bob", `update public.profiles set display_name = 'x'`), /permission denied/);
        assert.equal((await as("dana", `select public.is_admin() as v`))[0].v, true);
        assert.equal((await as("carol", `select public.is_admin() as v`))[0].v, false);
        assert.equal((await as("carol", `select public.is_moderator() as v`))[0].v, true);
        await fails(as("dana", `select public.admin_set_staff_role($1, null)`, [USERS.dana]), /own role/);
    });
});

describe("comments", () => {
    let root;
    let reply;

    test("create, reply, and replies to replies attach to the top-level comment", async () => {
        root = await addComment("alice", "  Great movie  ");
        reply = await addComment("bob", "Agreed", root);
        const nested = await addComment("carol", "Me too", reply);
        const [row] = await sys(`select parent_comment_id, content from public.comments where id = $1`, [nested]);
        assert.equal(row.parent_comment_id, root);
        const top = await thread("bob");
        assert.equal(top.length, 1);
        assert.equal(top[0].content, "Great movie");
        assert.equal(Number(top[0].reply_count), 2);
        assert.equal(top[0].is_mine, false);
        const replies = await thread("bob", root);
        assert.deepEqual(replies.map((r) => r.content), ["Agreed", "Me too"]);
    });

    test("content is validated", async () => {
        await fails(addComment("alice", "   "), /comments_content_check/);
        await fails(addComment("alice", "x".repeat(2001)), /comments_content_check/);
        await fails(addComment("alice", "bad type", null, ["trakt", "show", "1"]), /content_type_check/);
        await fails(addComment("alice", "wrong title", root, ["trakt", "movie", "999"]), /invalid_parent/);
    });

    test("users cannot spoof authorship or server-owned fields", async () => {
        await fails(
            as("alice", `insert into public.comments (content_provider, content_type, content_id, content, user_id) values ('trakt','movie','123','x',$1)`, [USERS.bob]),
            /permission denied/,
        );
        await fails(as("alice", `update public.comments set is_deleted = true where id = $1`, [root]), /permission denied/);
        await fails(as("anon", `select * from public.get_comments('trakt','movie','123')`), /permission denied/);
    });

    test("only the author can edit; edits are marked", async () => {
        const none = await as("bob", `update public.comments set content = 'hacked' where id = $1 returning id`, [root]);
        assert.equal(none.length, 0);
        await as("alice", `update public.comments set content = 'Great movie!' where id = $1`, [root]);
        const [row] = await sys(`select content, edited_at from public.comments where id = $1`, [root]);
        assert.equal(row.content, "Great movie!");
        assert.ok(row.edited_at);
    });

    test("only the author can delete; a deleted parent with replies becomes a placeholder", async () => {
        await fails(as("bob", `select public.delete_comment($1)`, [root]), /comment_unavailable/);
        await as("alice", `select public.delete_comment($1)`, [root]);
        const [top] = await thread("bob");
        assert.equal(top.is_deleted, true);
        assert.equal(top.content, null);
        assert.equal(top.deletion_reason, "author");
        await fails(addComment("bob", "late reply", root), /comment_unavailable/);
        // RLS hides deleted rows from updates, so editing one changes nothing
        assert.equal((await as("alice", `update public.comments set content = 'back' where id = $1 returning id`, [root])).length, 0);
        // Another user can't read the deleted text directly either
        assert.equal((await as("bob", `select * from public.comments where id = $1`, [root])).length, 0);
        assert.equal((await as("carol", `select * from public.comments where id = $1`, [root])).length, 1);
    });

    test("deleted replies disappear and a parent with no visible replies is hidden", async () => {
        const replies = await thread("alice", root);
        for (const r of replies) {
            const author = r.content === "Agreed" ? "bob" : "carol";
            await as(author, `select public.delete_comment($1)`, [r.id]);
        }
        assert.equal((await thread("alice", root)).length, 0);
        assert.equal((await thread("alice")).length, 0);
        assert.equal(Number((await as("alice", `select public.get_comment_count('trakt','movie','123') as n`))[0].n), 0);
    });

    test("keyset pagination returns each comment once, newest first", async () => {
        const ref = ["shoofaflam", "series", "el-king"];
        const ids = [];
        for (let i = 0; i < 5; i++) ids.push(await addComment("dana", `c${i}`, null, ref));
        const seen = [];
        let cursor = [null, null];
        for (;;) {
            const page = await as("bob", `select * from public.get_comments($1,$2,$3,null,$4,$5,2)`, [...ref, ...cursor]);
            if (!page.length) break;
            seen.push(...page.map((r) => r.content));
            const last = page.at(-1);
            cursor = [last.created_at, last.id];
        }
        assert.equal(seen.length, 5);
        assert.equal(new Set(seen).size, 5);
    });

    test("posting is rate limited", async () => {
        const ref = ["trakt", "series", "77"];
        await ageComments(USERS.bob);
        for (let i = 0; i < 10; i++) await addComment("bob", `spam ${i}`, null, ref);
        await fails(addComment("bob", "one more", null, ref), /rate_limited/);
        await ageComments(USERS.bob);
    });
});

describe("likes", () => {
    let id;
    before(async () => {
        id = await addComment("alice", "Like me");
    });

    test("a like counts once and shows as liked", async () => {
        const like = () => as("bob", `insert into public.comment_likes (comment_id) values ($1) on conflict do nothing`, [id]);
        await like();
        await like();
        const [row] = (await thread("bob")).filter((r) => r.id === id);
        assert.equal(Number(row.like_count), 1);
        assert.equal(row.liked_by_me, true);
        const [forAlice] = (await thread("alice")).filter((r) => r.id === id);
        assert.equal(forAlice.liked_by_me, false);
    });

    test("users cannot like for someone else or read others' likes", async () => {
        await fails(as("alice", `insert into public.comment_likes (comment_id, user_id) values ($1, $2)`, [id, USERS.bob]), /permission denied/);
        assert.equal((await as("alice", `select * from public.comment_likes`)).length, 0);
        assert.equal((await as("alice", `delete from public.comment_likes where comment_id = $1 returning 1`, [id])).length, 0);
    });

    test("unlike works; deleted comments cannot be liked", async () => {
        await as("bob", `delete from public.comment_likes where comment_id = $1`, [id]);
        assert.equal(Number((await thread("bob")).find((r) => r.id === id).like_count), 0);
        await as("alice", `select public.delete_comment($1)`, [id]);
        await fails(as("bob", `insert into public.comment_likes (comment_id) values ($1)`, [id]), /row-level security/);
    });
});

describe("reports and moderation", () => {
    let id;
    let reportId;
    before(async () => {
        id = await addComment("alice", "Spoiler: everyone dies");
    });

    test("users report once, never their own or deleted comments, and can't read reports", async () => {
        await as("bob", `select public.report_comment($1, 'spoilers', 'ruined it')`, [id]);
        await fails(as("bob", `select public.report_comment($1, 'spam')`, [id]), /already_reported/);
        await fails(as("alice", `select public.report_comment($1, 'spam')`, [id]), /own_comment/);
        await fails(as("carol", `select public.report_comment($1, 'nonsense')`, [id]), /reason_check/);
        await fails(as("bob", `select * from public.comment_reports`), /permission denied/);
        await fails(as("bob", `select * from public.admin_list_reports()`), /Not authorized/);
    });

    test("moderators list, reject and resolve reports; actions are logged", async () => {
        const reports = await as("carol", `select * from public.admin_list_reports('pending')`);
        assert.equal(reports.length, 1);
        reportId = reports[0].id;
        assert.equal(reports[0].reporter_name, "Bob");
        await as("carol", `select public.admin_set_report_status($1, 'rejected', 'not a spoiler')`, [reportId]);
        // A closed report doesn't block a new one
        await as("bob", `select public.report_comment($1, 'spoilers')`, [id]);
        const listed = await as("carol", `select * from public.admin_list_comments(p_reported_only => true)`);
        assert.ok(listed.some((r) => r.id === id && Number(r.open_report_count) === 1 && r.author_email === "alice@example.com"));
        const search = await as("carol", `select * from public.admin_list_comments(p_search => 'everyone')`);
        assert.equal(search.length, 1);
        assert.equal(Number(search[0].total_count), 1);
    });

    test("removing a comment resolves its reports, notifies the author and can be undone", async () => {
        await fails(as("bob", `select public.admin_remove_comment($1)`, [id]), /Not authorized/);
        await as("carol", `select public.admin_remove_comment($1, 'spoilers')`, [id]);
        const open = await as("carol", `select * from public.admin_list_reports('open')`);
        assert.equal(open.length, 0);
        const detail = (await as("carol", `select public.admin_get_comment($1) as d`, [id]))[0].d;
        assert.equal(detail.comment.deletion_reason, "moderator");
        assert.deepEqual(detail.history.map((h) => h.action).sort(), ["remove_comment", "report_rejected"]);
        const events = await sys(`select * from public.notification_events where kind = 'moderation' and recipient_user_id = $1`, [USERS.alice]);
        assert.equal(events.length, 1);
        await fails(as("bob", `select public.report_comment($1, 'spam')`, [id]), /comment_unavailable/);
        await as("carol", `select public.admin_restore_comment($1, 'appeal accepted')`, [id]);
        assert.ok((await thread("bob")).some((r) => r.id === id && r.content));
    });
});

describe("ratings", () => {
    const ref = ["shoofaflam", "movie", "valley-of-the-dead"];
    const rate = (user, value) =>
        as(user, `select * from public.set_content_rating($1, $2, $3, $4::smallint)`, [...ref, value]).then((r) => r[0]);

    test("averages update as users rate, re-rate and un-rate", async () => {
        await rate("bob", 4);
        let stats = await rate("alice", 2);
        assert.equal(Number(stats.average), 3);
        assert.equal(stats.rating_count, 2);
        assert.equal(stats.my_rating, 2);
        stats = await rate("bob", 5);
        assert.equal(Number(stats.average), 3.5);
        assert.equal(stats.rating_count, 2);
        stats = await rate("bob", null);
        assert.equal(Number(stats.average), 2);
        assert.equal(stats.rating_count, 1);
        assert.equal(stats.my_rating, null);
        const [none] = await as("carol", `select * from public.get_content_rating('trakt','movie','nope')`);
        assert.equal(none.rating_count, 0);
        assert.equal(none.average, null);
    });

    test("ratings are validated and aggregates can't be tampered with", async () => {
        await fails(rate("bob", 6), /rating_check/);
        await fails(rate("bob", 0), /rating_check/);
        await fails(as("bob", `update public.content_rating_stats set rating_sum = 999`), /permission denied/);
        await fails(as("bob", `update public.content_ratings set content_id = 'other'`), /permission denied/);
        await fails(as("bob", `insert into public.content_ratings (user_id, content_provider, content_type, content_id, rating) values ($1,'trakt','movie','1',5)`, [USERS.alice]), /permission denied/);
        assert.equal((await as("bob", `select * from public.content_ratings`)).length, 0);
        assert.equal((await as("anon", `select * from public.content_rating_stats`)).length, 1);
    });
});

describe("push tokens and preferences", () => {
    const token = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";

    test("tokens move to the account that last registered them and are never readable", async () => {
        await as("alice", `select public.register_push_token($1, 'ios')`, [token]);
        await as("bob", `select public.register_push_token($1, 'ios')`, [token]);
        const [row] = await sys(`select user_id, is_active from public.user_push_tokens where expo_push_token = $1`, [token]);
        assert.equal(row.user_id, USERS.bob);
        await fails(as("bob", `select * from public.user_push_tokens`), /permission denied/);
        await fails(as("bob", `select public.register_push_token('not-a-token', 'ios')`), /expo_push_token_check/);
        // Alice no longer owns it, so her sign-out doesn't touch it
        await as("alice", `select public.unregister_push_token($1)`, [token]);
        assert.equal((await sys(`select is_active from public.user_push_tokens where expo_push_token = $1`, [token]))[0].is_active, true);
        await as("bob", `select public.unregister_push_token($1)`, [token]);
        assert.equal((await sys(`select is_active from public.user_push_tokens where expo_push_token = $1`, [token]))[0].is_active, false);
    });

    test("preferences are private to their owner", async () => {
        await as("bob", `insert into public.notification_preferences (daily_discovery, language) values (false, 'ar')`);
        await fails(as("alice", `insert into public.notification_preferences (user_id) values ($1)`, [USERS.carol]), /permission denied/);
        assert.equal((await as("alice", `select * from public.notification_preferences`)).length, 0);
        assert.equal((await as("alice", `update public.notification_preferences set daily_discovery = true returning 1`)).length, 0);
    });
});

describe("campaigns and dispatch", () => {
    const tokens = {
        alice: "ExponentPushToken[alice000000000000000]",
        bob: "ExponentPushToken[bob00000000000000000]",
        carol: "ExponentPushToken[carol000000000000000]",
    };
    const message = { title_ar: "ع", body_ar: "نص", title_en: "T", body_en: "B", data: { url: "/home" } };
    let campaignId;
    let executionId;

    before(async () => {
        for (const [user, token] of Object.entries(tokens)) await as(user, `select public.register_push_token($1, 'android')`, [token]);
        await as("carol", `insert into public.notification_preferences (language) values ('ar')`);
    });

    test("only admins manage campaigns; timezones are validated", async () => {
        const insert = (user, tz) =>
            as(
                user,
                `insert into public.notification_campaigns (name, title_ar, body_ar, title_en, body_en, timezone, schedule_time, is_enabled)
                 values ('Daily', 'ع', 'نص', 'T', 'B', $1, ((now() at time zone $1) - interval '5 minutes')::time, true) returning id`,
                [tz],
            );
        await fails(insert("carol", "Africa/Cairo"), /row-level security/);
        await fails(insert("dana", "Mars/Olympus"), /time zone/);
        campaignId = (await insert("dana", "Africa/Cairo"))[0].id;
        // Enabled just now: today's run (5 minutes ago) predates enabling and must not send
        assert.equal((await as("service", `select * from public.notif_claim_due_campaigns()`)).length, 0);
        await sys(`update public.notification_campaigns set enabled_at = now() - interval '1 hour' where id = $1`, [campaignId]);
        const overview = await as("dana", `select next_run_at from public.notification_campaigns_overview where id = $1`, [campaignId]);
        assert.ok(new Date(overview[0].next_run_at) > new Date());
        await fails(as("bob", `select public.notif_claim_due_campaigns()`), /permission denied/);
    });

    test("a due campaign runs once per day, honoring preferences and audience", async () => {
        const claimed = await as("service", `select * from public.notif_claim_due_campaigns()`);
        assert.equal(claimed.length, 1);
        executionId = claimed[0].execution_id;
        // Claiming again returns the same unprepared run, never a second one
        const again = await as("service", `select * from public.notif_claim_due_campaigns()`);
        assert.deepEqual(again.map((r) => r.execution_id), [executionId]);
        assert.equal(Number((await sys(`select count(*) n from public.campaign_executions`))[0].n), 1);

        const queued = (await as("service", `select public.notif_prepare_execution($1, $2) as n`, [executionId, message]))[0].n;
        // bob turned daily discovery off
        assert.equal(queued, 2);
        assert.equal((await as("service", `select public.notif_prepare_execution($1, $2) as n`, [executionId, message]))[0].n, 0);
        const carol = await sys(
            `select d.title from public.notification_deliveries d join public.user_push_tokens t on t.id = d.token_id where t.expo_push_token = $1`,
            [tokens.carol],
        );
        assert.equal(carol[0].title, "ع");
        assert.equal((await as("service", `select * from public.notif_claim_due_campaigns()`)).length, 0);
    });

    test("a second campaign the same day skips devices already notified", async () => {
        const [second] = await sys(
            `insert into public.notification_campaigns (name, title_ar, body_ar, title_en, body_en, schedule_time, timezone, is_enabled)
             values ('Second', 'ع', 'نص', 'T', 'B', '00:00', 'UTC', true) returning id`,
        );
        const [exec] = await sys(
            `insert into public.campaign_executions (campaign_id, scheduled_date, scheduled_for)
             values ($1, (now() at time zone 'Africa/Cairo')::date, now()) returning id`,
            [second.id],
        );
        assert.equal((await as("service", `select public.notif_prepare_execution($1, $2) as n`, [exec.id, message]))[0].n, 0);
    });

    test("claimed deliveries are sent once; tickets, retries and dead tokens are recorded", async () => {
        const batch = await as("service", `select * from public.notif_claim_queued(100)`);
        assert.equal(batch.length, 2);
        assert.equal((await as("service", `select * from public.notif_claim_queued(100)`)).length, 0);
        const [ok, dead] = batch;
        await as("service", `select public.notif_record_tickets($1)`, [
            [
                { id: ok.id, status: "ticket_ok", ticket_id: "t-1" },
                { id: dead.id, status: "ticket_error", error_code: "DeviceNotRegistered", error_message: "gone" },
            ],
        ]);
        const deadToken = await sys(`select is_active, deactivated_reason from public.user_push_tokens where expo_push_token = $1`, [dead.expo_push_token]);
        assert.deepEqual(deadToken[0], { is_active: false, deactivated_reason: "device_not_registered" });

        // Receipts: only after 15 minutes
        assert.equal((await as("service", `select * from public.notif_pending_receipts()`)).length, 0);
        await sys(`update public.notification_deliveries set submitted_at = now() - interval '20 minutes' where id = $1`, [ok.id]);
        const pending = await as("service", `select * from public.notif_pending_receipts()`);
        assert.deepEqual(pending.map((p) => p.ticket_id), ["t-1"]);
        await as("service", `select public.notif_record_receipts($1)`, [[{ id: ok.id, status: "delivered" }]]);

        await as("service", `select public.notif_finalize_executions()`);
        const [exec] = await sys(`select * from public.campaign_executions where id = $1`, [executionId]);
        assert.equal(exec.status, "completed");
        assert.equal(exec.submitted_count, 2);
        assert.equal(exec.ticket_ok_count, 1);
        assert.equal(exec.ticket_error_count, 1);
        assert.equal(exec.delivered_count, 1);
    });

    test("transient failures retry at most three times; unknown outcomes never retry", async () => {
        await as("dana", `select public.register_push_token($1, 'ios')`, ["ExponentPushToken[dana0000000000000000]"]);
        assert.equal((await as("dana", `select public.admin_queue_test_notification('Test', 'Hello') as n`))[0].n, 1);
        await fails(as("carol", `select public.admin_queue_test_notification('Test', 'Hello')`), /Not authorized/);
        for (let attempt = 1; attempt <= 3; attempt++) {
            const [row] = await as("service", `select * from public.notif_claim_queued(10)`);
            assert.ok(row, `attempt ${attempt} claimed`);
            await as("service", `select public.notif_record_tickets($1)`, [[{ id: row.id, status: "retry", error_message: "HTTP 503" }]]);
        }
        const [final] = await sys(`select status, attempts from public.notification_deliveries where kind = 'test'`);
        assert.deepEqual(final, { status: "failed", attempts: 3 });

        await as("dana", `select public.admin_queue_test_notification('Test', 'Again')`);
        await as("service", `select * from public.notif_claim_queued(10)`);
        await sys(`update public.notification_deliveries set updated_at = now() - interval '11 minutes' where status = 'sending'`);
        await as("service", `select * from public.notif_claim_queued(10)`);
        const [lost] = await sys(`select status from public.notification_deliveries where body = 'Again'`);
        assert.equal(lost.status, "unknown");
    });

    test("replies notify the parent author, respecting their preference", async () => {
        await sys(`update public.notification_events set status = 'processed'`);
        const parent = await addComment("alice", "Who else loved it?");
        await addComment("carol", "Me!", parent);
        await addComment("alice", "Replying to myself", parent);
        const messages = {
            comment_reply: { title_ar: "رد", body_ar: "{name} رد", title_en: "Reply", body_en: "{name} replied" },
            moderation: { title_ar: "م", body_ar: "م", title_en: "M", body_en: "M" },
        };
        assert.equal((await as("service", `select public.notif_expand_events($1) as n`, [messages]))[0].n, 1);
        const [delivery] = await sys(`select title, body, data from public.notification_deliveries where kind = 'comment_reply'`);
        assert.equal(delivery.body, "Carol replied");
        assert.equal(delivery.data.url, "/movie/123?focus=comments");

        await as("alice", `insert into public.notification_preferences (comment_replies) values (false)`);
        await addComment("bob", "Nice", parent);
        await as("service", `select public.notif_expand_events($1)`, [messages]);
        assert.equal(Number((await sys(`select count(*) n from public.notification_deliveries where kind = 'comment_reply'`))[0].n), 1);
        assert.equal(Number((await sys(`select count(*) n from public.notification_events where status = 'pending'`))[0].n), 0);
    });

    test("dashboard stats are admin only", async () => {
        const [{ s }] = await as("dana", `select public.admin_notification_stats() as s`);
        assert.ok(s.tokens_total >= 4);
        assert.equal(s.deliveries.delivered, 1);
        assert.equal(s.last_execution.campaign_name !== undefined, true);
        await fails(as("carol", `select public.admin_notification_stats()`), /Not authorized/);
        assert.equal((await as("bob", `select * from public.campaign_executions`)).length, 0);
        assert.equal((await as("bob", `select * from public.notification_deliveries`)).length, 0);
    });
});

describe("watch schedule", () => {
    // The app's saveSchedule(): insert, and on a unique violation update the
    // time and snapshot of the existing row
    const schedule = async (user, when, id = "123", extra = {}) => {
        const snapshot = [extra.title ?? "Dune", extra.poster ?? "https://img.example/p.jpg", when];
        try {
            return await as(
                user,
                `insert into public.watch_schedule (content_provider, content_type, content_id, content_slug, title_ar, title_en, poster_url, scheduled_at)
                 values ('trakt', 'movie', $1, null, null, $2, $3, $4) returning id, scheduled_at`,
                [id, ...snapshot],
            );
        } catch (error) {
            if (error.code !== "23505") throw error;
            return as(
                user,
                `update public.watch_schedule set content_slug = null, title_ar = null, title_en = $2, poster_url = $3, scheduled_at = $4
                 where content_provider = 'trakt' and content_type = 'movie' and content_id = $1 returning id, scheduled_at`,
                [id, ...snapshot],
            );
        }
    };

    test("one entry per title; scheduling again moves it", async () => {
        const [first] = await schedule("alice", "2026-10-20T19:00:00Z");
        const [second] = await schedule("alice", "2026-10-21T20:30:00Z");
        assert.equal(second.id, first.id);
        assert.equal(new Date(second.scheduled_at).toISOString(), "2026-10-21T20:30:00.000Z");
        assert.equal((await as("alice", `select * from public.watch_schedule`)).length, 1);
    });

    test("a PostgREST upsert is refused: it would rewrite the title's identity columns", async () => {
        // What supabase-js .upsert() sends on conflict: SET every column in the payload
        await fails(
            as(
                "alice",
                `insert into public.watch_schedule (content_provider, content_type, content_id, title_en, scheduled_at)
                 values ('trakt', 'movie', '123', 'Dune', now())
                 on conflict (user_id, content_provider, content_type, content_id) do update set
                     content_provider = excluded.content_provider, content_type = excluded.content_type,
                     content_id = excluded.content_id, title_en = excluded.title_en, scheduled_at = excluded.scheduled_at`,
            ),
            /permission denied/,
        );
    });

    test("entries are private and can't be spoofed", async () => {
        await schedule("bob", "2026-10-22T18:00:00Z", "999");
        assert.equal((await as("alice", `select * from public.watch_schedule`)).length, 1);
        assert.equal((await as("alice", `delete from public.watch_schedule where content_id = '999' returning 1`)).length, 0);
        assert.equal((await as("alice", `update public.watch_schedule set scheduled_at = now() where content_id = '999' returning 1`)).length, 0);
        await fails(
            as("alice", `insert into public.watch_schedule (user_id, content_provider, content_type, content_id, title_en, scheduled_at) values ($1,'trakt','movie','5','x',now())`, [USERS.bob]),
            /permission denied/,
        );
        await fails(as("anon", `select * from public.watch_schedule`), /permission denied/);
    });

    test("snapshots are validated", async () => {
        await fails(schedule("alice", "2026-10-20T19:00:00Z", "7", { poster: "javascript:alert(1)" }), /poster_url_check/);
        await fails(
            as("alice", `insert into public.watch_schedule (content_provider, content_type, content_id, scheduled_at) values ('trakt','movie','8',now())`),
            /watch_schedule_has_title/,
        );
        assert.equal((await as("alice", `delete from public.watch_schedule where content_id = '123' returning 1`)).length, 1);
    });
});
