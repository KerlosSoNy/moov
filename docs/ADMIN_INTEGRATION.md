# Admin panel integration

The admin panel isn't in this repository, so no admin UI was built here. This document is the contract the panel should implement against. Every operation below already exists in the database and is covered by `scripts/test-db.mjs`.

## Connecting

Use `@supabase/supabase-js` with the **publishable (anon) key** and a signed-in staff user's session. Never ship the service-role key in the panel's frontend bundle: every admin operation is authorized server side by the user's role.

```ts
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
await supabase.auth.signInWithPassword({ email, password });

const { data: role } = await supabase.rpc("staff_role"); // 'admin' | 'moderator' | null
```

- Gate the UI on `role`. Treat this as a convenience only: the database rejects non-staff calls with SQLSTATE `42501` ("Not authorized") regardless of what the UI shows.
- `moderator` can use **Comments & Moderation**.
- `admin` can also use **Notifications** and manage staff.

Errors come back as `error.message` holding a stable code: `comment_unavailable`, `report_not_found`, `invalid_status`, `invalid_message`, or `Not authorized`.

---

## Sidebar: Comments & Moderation

### Comments table

```ts
const { data } = await supabase.rpc("admin_list_comments", {
  p_search: "text, author name/email, user id, comment id or content id", // optional
  p_status: "all",          // 'all' | 'visible' | 'deleted'
  p_content_type: null,     // 'movie' | 'series' | null
  p_reported_only: false,
  p_from: null, p_to: null, // ISO timestamps, created_at range
  p_page: 1, p_page_size: 25,
});
// Each row: id, content_provider, content_type, content_id, parent_comment_id,
// user_id, author_name, author_email, content, is_deleted, deletion_reason,
// deleted_at, created_at, edited_at, like_count, reply_count, report_count,
// open_report_count, total_count  ← total rows across all pages
```

**Comment detail drawer:** `rpc("admin_get_comment", { p_comment_id })` returns `{ comment, parent, replies[], reports[], history[] }`. Reports include `reporter_name`, and history includes `actor_name`.

**View the title:**

| `content_provider` | Link to |
| --- | --- |
| `shoofaflam` | `https://shoofaflam.tv/` (the title's `content_id` is its slug) |
| `trakt` + `movie` | `https://trakt.tv/movies/<content_id>` |
| `trakt` + `series` | `https://trakt.tv/shows/<content_id>` |

**Actions** (each one writes a `moderation_actions` row with the acting admin):

```ts
await supabase.rpc("admin_remove_comment", { p_comment_id, p_note });   // soft delete; resolves its open reports; notifies the author
await supabase.rpc("admin_restore_comment", { p_comment_id, p_note });
```

**Moderation history** (global or per comment):

```ts
await supabase.rpc("admin_moderation_history", { p_comment_id: null, p_page: 1, p_page_size: 50 });
```

### Reports view

```ts
const { data } = await supabase.rpc("admin_list_reports", {
  p_status: "pending", // 'pending' | 'reviewed' | 'resolved' | 'rejected' | 'open' (pending+reviewed) | 'all'
  p_page: 1, p_page_size: 25,
});
// Each row: id, comment_id, reason, description, status, created_at, reviewed_at,
// reviewed_by_name, resolution_note, reporter_name, comment_content,
// comment_is_deleted, comment_author_name, content_provider, content_type,
// content_id, comment_report_count, total_count

await supabase.rpc("admin_set_report_status", { p_report_id, p_status: "reviewed", p_note });  // or 'resolved' | 'rejected'
```

Report reasons are `spam`, `harassment`, `offensive`, `spoilers` and `other`. To remove a reported comment, call `admin_remove_comment`; that resolves every open report on it.

States to handle: loading, empty ("No pending reports"), an error with retry, and a success toast after each action. A `comment_unavailable` error usually means another moderator acted first, so refresh the row.

---

## Sidebar: Notifications (admins only)

### Dashboard

```ts
const { data: stats } = await supabase.rpc("admin_notification_stats", { p_days: 30 });
```

`stats` contains:

| Field | Meaning |
| --- | --- |
| `tokens_total` | All registered push tokens |
| `tokens_active` | Tokens still active |
| `users_with_active_tokens` | Users with at least one active token |
| `daily_discovery_opted_out` | Users who turned daily discovery off |
| `deliveries.queued` | Waiting to send |
| `deliveries.submitted` | Sent to Expo |
| `deliveries.accepted` | Ticket ok |
| `deliveries.rejected` | Ticket error |
| `deliveries.delivered` | Receipt ok: handed to Apple/Google |
| `deliveries.delivery_failed` | Receipt error |
| `deliveries.unknown` | Outcome unknown, not retried |
| `deliveries.awaiting_receipt` | Accepted, receipt not checked yet |
| `top_errors[]` | `{ error_code, count }` |
| `last_execution` | Most recent campaign run |
| `next_run` | `{ campaign_name, run_at }` |

Label tiles by what they measure: "Submitted to Expo", "Accepted by Expo", "Confirmed handed to Apple/Google". Don't label anything "Delivered to users".

**Recent campaign history:**

```ts
await supabase.from("campaign_executions")
  .select("*, notification_campaigns(name)")
  .order("started_at", { ascending: false })
  .range(0, 24);
```

**Errors for one execution:**

```ts
await supabase.from("notification_deliveries")
  .select("id, status, error_code, error_message, created_at")
  .eq("execution_id", id)
  .in("status", ["ticket_error", "failed", "unknown"])
  .range(0, 99);
```

### Campaigns (create, edit, enable)

RLS lets admins read and write these tables directly.

```ts
// List with last/next run
await supabase.from("notification_campaigns_overview").select("*").order("created_at", { ascending: false });

// Create
await supabase.from("notification_campaigns").insert({
  name: "Daily discovery",
  campaign_type: "daily_discovery",          // 'daily_discovery' | 'new_content' | 'reminder'
  title_en: "🎬 Moov", body_en: "Discover your next favorite movie on Moov!",          // title ≤ 100, body ≤ 240 chars
  title_ar: "🎬 Moov", body_ar: "اكتشف فيلمك الجديد النهارده على Moov!",
  use_template_rotation: true,               // rotate notification_templates daily
  recommendation_source: "catalog",          // 'none' | 'fixed' | 'catalog'
  // for 'fixed': content_provider, content_type, content_id, content_title_ar, content_title_en
  schedule_time: "19:00",
  timezone: "Africa/Cairo",                  // IANA name; invalid names are rejected
  target_audience: "all",                    // 'all' | 'ar' | 'en' (users' notification language)
  is_enabled: false,
});

// Edit, enable or disable: plain updates. The dispatcher reads the row every
// minute, so changes take effect on the next tick. No cron change is needed.
await supabase.from("notification_campaigns").update({ is_enabled: true }).eq("id", id);
```

Behavior worth showing in the UI:

- Each campaign sends at most once per local day.
- A device receives at most one campaign notification per day, across all campaigns.
- Enabling a campaign after today's time doesn't send late. The first run is the next scheduled time.

**Templates** (rotation pool, `{title}` = recommended title): CRUD on `notification_templates` with fields `title_ar`, `body_ar`, `title_en`, `body_en` and `is_active`.

**Preview:** render the four text fields client side. `{title}` is replaced with the recommendation, and the deep link is `/content/<provider>/<type>/<id>`, `/movie/<id>`, or `/home` when there's no recommendation.

### Test send

Queue the test for the signed-in admin's own registered devices, then trigger an immediate dispatch. The function accepts an admin JWT, so no cron wait is needed.

```ts
const { data: queued } = await supabase.rpc("admin_queue_test_notification", {
  p_title: "Test", p_body: "Hello from Moov", p_data: { url: "/home" },
});
if (queued === 0) showError("No device registered for your account. Sign in to the app and enable notifications.");
await supabase.functions.invoke("notifications-dispatch", { method: "POST" });
// Result: notification_deliveries rows with kind = 'test'
```

### Staff management (admins)

```ts
await supabase.rpc("admin_set_staff_role", { p_user_id, p_role: "moderator" }); // 'admin' | 'moderator' | null to revoke
```
