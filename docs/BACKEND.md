# Moov backend: setup, deployment and security

This covers the Supabase side of Moov: community features (comments, likes, reports, ratings), moderation, and push notifications. The admin panel contract is in [ADMIN_INTEGRATION.md](ADMIN_INTEGRATION.md).

## What lives where

| Piece | Location |
| --- | --- |
| SQL migrations | `supabase/migrations/` |
| Notification dispatcher (Edge Function) | `supabase/functions/notifications-dispatch/` |
| Shared function code (Expo client, message building) | `supabase/functions/_shared/` |
| Database tests (RLS, constraints, idempotency) | `scripts/test-db.mjs` |
| Unit tests (normalizers, messages, time formatting) | `scripts/tests/*.test.mts` |

### Migrations (apply in order)

| File | Adds |
| --- | --- |
| `20261013000000_favorites.sql` | Existing: favorites |
| `20261013000100_avatars.sql` | Existing: avatar storage bucket |
| `20261014000000_profiles_and_roles.sql` | `profiles` (mirrored from auth metadata), `admin_users`, `is_admin()` / `is_moderator()` |
| `20261014000100_comments.sql` | `comments`, `comment_likes`, `comment_reports`, `moderation_actions`, user and moderator RPCs |
| `20261014000200_content_ratings.sql` | `content_ratings`, `content_rating_stats` (trigger-maintained), rating RPCs |
| `20261014000300_push_notifications.sql` | Tokens, preferences, campaigns, templates, executions, deliveries, event outbox, dispatcher functions, admin stats |
| `20261014000400_notifications_cron.sql` | `pg_cron` jobs: dispatch every minute, nightly log cleanup |
| `20261015000000_watch_schedule.sql` | `watch_schedule`: each user's planned watch times (owner-only). Reminders are local notifications on the device |

None of the new migrations alter or drop existing objects. They only create objects, plus one backfill: a `profiles` row for each existing user.

## Environment variables and secrets

**App (`.env`, bundled into the app, so public):** see `.env.example`. The app only ever uses the Supabase **publishable/anon** key.

**Edge Function secrets:** see `supabase/functions/.env.example`.

| Name | Where | Purpose |
| --- | --- | --- |
| `CRON_SECRET` | Function secret **and** Vault (`notifications_cron_secret`) | Authenticates cron → function calls; ≥ 32 characters |
| `EXPO_ACCESS_TOKEN` | Function secret (optional) | Only if Expo "enhanced push security" is on |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Provided by the Edge runtime | Service role is used only inside the function |

**Vault secrets** (read by the cron job at call time, so they never live in git):

| Name | Value |
| --- | --- |
| `notifications_dispatch_url` | `https://<project-ref>.supabase.co/functions/v1/notifications-dispatch` |
| `notifications_cron_secret` | Same value as `CRON_SECRET` |

## Deploy

```bash
# 1. Link the project (once)
npx supabase login
npx supabase link --project-ref <project-ref>

# 2. Apply migrations (review first: npx supabase db push --dry-run)
npx supabase db push

# 3. Function secrets
openssl rand -hex 32            # → use as CRON_SECRET
cp supabase/functions/.env.example supabase/functions/.env   # fill in, never commit
npx supabase secrets set --env-file supabase/functions/.env

# 4. Deploy the dispatcher. It checks auth itself (cron secret or admin JWT),
#    so gateway JWT verification is off.
npx supabase functions deploy notifications-dispatch --no-verify-jwt
```

5. **Vault secrets.** In the SQL editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/notifications-dispatch', 'notifications_dispatch_url');
select vault.create_secret('<same value as CRON_SECRET>', 'notifications_cron_secret');
```

6. **First admin.** Roles can't be granted from the app. Run this once in the SQL editor:

```sql
insert into public.admin_users (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com';
```

After that, admins manage staff with `admin_set_staff_role(user_id, 'admin' | 'moderator' | null)`.

7. **Push credentials.** Configure them for the EAS project (`bunx eas-cli credentials` / `npx eas-cli@latest credentials`): APNs key for iOS, FCM v1 service account for Android. Then build a **development build**. Remote push doesn't work in Expo Go on Android, and `expo-notifications` is a new native module:

```bash
npx eas-cli@latest build --profile development --platform all
```

8. **First campaign.** Insert a row into `notification_campaigns` (see the admin doc) with `is_enabled = true`. It sends at the next `schedule_time` in its `timezone`.

### Verify after deploy

```sql
select * from cron.job;                                   -- both jobs present
select * from cron.job_run_details order by start_time desc limit 5;
select * from net._http_response order by created desc limit 5;  -- function responses
```

Invoke the function manually: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<ref>.supabase.co/functions/v1/notifications-dispatch` returns a JSON summary.

## How the daily campaign works

Every minute, cron calls `notifications-dispatch`, which:

1. **Claims due runs.** `notif_claim_due_campaigns()` creates at most **one execution per campaign per local day**, enforced by the unique constraint `(campaign_id, scheduled_date)`. A run is due once `schedule_time` has passed in the campaign's timezone. There is a 3-hour catch-up window if the scheduler was down, and runs scheduled before the campaign was enabled never fire.
2. **Builds the message.** It uses the campaign text, or a rotating template from `notification_templates` (stable for the day, so retries match). It can fill `{title}` with a recommendation: a fixed title, or a pick from the Shoof Aflam catalog. If the catalog is down, it falls back to a plain discovery message.
3. **Fans out.** `notif_prepare_execution()` queues one delivery per eligible device: active token, daily discovery not turned off, audience language matches. A partial unique index allows **one campaign notification per device per day across all campaigns**.
4. **Sends.** `notif_claim_queued()` claims queued rows with `FOR UPDATE SKIP LOCKED`, so overlapping runs never double send. Rows go to Expo in batches of 100.
5. **Records outcomes.**
   - `ticket_ok` / `ticket_error`: Expo's per-message tickets.
   - `retry`: a 429/5xx means the whole request was refused. The rows are re-queued, up to 3 attempts.
   - `unknown`: a timeout or crash means the outcome is unknown. These rows are **not** retried, to avoid duplicates.
   - `DeviceNotRegistered` deactivates the token.
6. **Collects receipts.** After 15 minutes it fetches receipts: `delivered` means Expo handed the message to APNs/FCM; `failed` carries the receipt's error.
7. **Finalizes.** It recounts each execution's numbers from its deliveries and marks the execution completed.

Reply and moderation notifications use the same pipeline. Triggers write to `notification_events`, and `notif_expand_events()` turns those into deliveries, respecting the recipient's preferences.

What the numbers mean: **submitted** = sent to Expo; **accepted** = Expo returned an ok ticket; **delivered** = the receipt confirms hand-off to Apple/Google. Nothing here proves a person saw the notification.

## Security model

- **RLS on every table.** Each table also revokes all privileges from `anon`/`authenticated` and grants back only what's needed, column by column. This holds even on projects whose default privileges expose new tables. The DB tests run under exactly that worst case.
- **Comments.** Users insert only `content_*`, `parent_comment_id` and `content`, and update only `content`. `user_id`, timestamps and deletion fields are server-owned (trigger plus grants). Deletion goes through `delete_comment()`, which is author-only. A user can post at most 10 comments per minute.
- **Deleted comments.** These are soft deleted. `get_comments()` never returns their text, and the direct table `SELECT` hides them from everyone but the author and staff.
- **Likes.** Primary key `(comment_id, user_id)`; liking a deleted comment is rejected by RLS. Counts are computed server side.
- **Reports.** No client table access. `report_comment()` checks that the comment is live and isn't the reporter's own. A partial unique index allows one open report per user and comment. Reporters are visible to staff only.
- **Ratings.** `rating between 1 and 5` is a CHECK constraint, and there's one rating per user and title. Aggregates live in `content_rating_stats`, which clients can only read and a `security definer` trigger maintains with atomic increments.
- **Roles.** `admin_users` has no client grants, so roles can't be read or changed from the app. `is_admin()` / `is_moderator()` read it server side, and every staff RPC checks it. Admins can't change their own role.
- **Push tokens.** These are never readable by clients. `register_push_token()` moves a token to whoever registers it last (account switching on one device), and the app calls `unregister_push_token()` before signing out.
- **Service role.** It's used only inside the Edge Function and never reaches the app. `notif_*` functions are executable by `service_role` only.

## Tests

```bash
npm test            # unit + database tests
npm run test:unit   # normalizers, notification messages, relative time
npm run test:db     # migrations in PGlite: RLS, constraints, RPCs, dispatcher idempotency
npm run typecheck   # tsc (the repo had 20 pre-existing errors in profile/ and mockMovies.ts)
npx expo lint
```

The DB tests stub only `auth.users`, `auth.uid()` and the API roles. They don't cover `pg_cron`, `pg_net`, Vault or Storage, so check those on a real project with the queries above.
